'use strict';

//const dataFetcher = require('./dataFetcher');
const { DateTime } = require('../bundles/luxon');
const AccountIdSetting = "krakenAccountId";
const ApiKeySetting = "krakenApiKey";
const Queries = require('./gQLQueries');

module.exports = class krakenAccountWrapper {
  /**
   * krakenAccountWrapper obtains the account overview data via GQL and then queries the data structure
   * in different ways.
   */

  /**
   * Constructor for krakenAccountWrapper
   * @param {krakenDriver}   driver  managing the devices 
   */
  constructor(driver) {
    driver.homey.log(`krakenAccountWrapper.constructor: Instantiating`);
    this._driver = driver;
    this._dataFetcher = driver.homey.app.dataFetcher;
    this._valid_device_status_translations = {
      SMART_CONTROL_NOT_AVAILABLE: `Device Unavailable`,
      SMART_CONTROL_CAPABLE: `Device Capable`,
      SMART_CONTROL_IN_PROGRESS: `Device Available`,
      BOOSTING: `Device Boosting`,
      SMART_CONTROL_OFF: `Smart Control Off`,
      LOST_CONNECTION: `Device Connection Lost`
    };
    this._timeZone = this._driver.homey.clock.getTimezone();
  }

  /**
   * Persist the parameters that give access to the Kraken account's data
   * @param {string} accountId    Kraken account Id in the form A-9A999999 
   * @param {string} apiKey       Kraken account specific API key 32 alpha numeric characters starting sk_live_...          
   */
  setAccessParameters(accountId, apiKey) {
    const settings = this._driver.homey.settings;
    settings.set(AccountIdSetting, accountId);
    settings.set(ApiKeySetting, apiKey);
  }

  /**
   * Retrieve the parameters that give access to the Kraken account's data
   * @returns {object}    With fields accountId and apiKey
   */
  get accessParameters() {
    const settings = this._driver.homey.settings;
    const keys = settings.getKeys();

    let parameters = {};
    parameters.accountId = undefined;
    parameters.apiKey = undefined;

    if (keys.includes(AccountIdSetting)) {
      parameters.accountId = settings.get(AccountIdSetting);
    }

    if (keys.includes(ApiKeySetting)) {
      parameters.apiKey = settings.get(ApiKeySetting);
    }

    return parameters;
  }

  /**
   * Return the account number of the Octopus account
   * @returns {string} Octopus account number in the form A-9A999999
   */
  get accountId() {
    return this.accessParameters.accountId;
  }

  /**
   * Get the live meter id on the account
   * @returns {string}      Live meter ID
   */
  getLiveMeterId(accountData) {
    let meterId = undefined;
    const account = accountData?.data?.account;
    const agreements = account?.electricityAgreements || [];

    const meter = agreements[0]?.meterPoint?.meters?.[0];

    if (meter) {
      meterId = meter.smartImportElectricityMeter?.deviceId
        || meter.smartExportElectricityMeter?.deviceId;
    }

    return meterId;
  }

  /**
   * Get the IDs of the smart devices on the account
   * @param   {object | undefined} accountData  Kraken account data
   * @returns {string[]}                        Array of smart device IDs
   */
  getDeviceIds(accountData) {
    const statusCodes = Object.keys(this._valid_device_status_translations);
    const devices = accountData?.data?.devices || [];

    const deviceIds = devices
      .filter(device => statusCodes.includes(device.status?.currentState))
      .map(device => device.id);

    this._driver.homey.log(`krakenAccountWrapper.getDeviceIds: ${deviceIds.length} smart devices`);
    return deviceIds;
  }

  /**
   * Return tariff details for the specified direction for the account overview
   * @param   {boolean} isExport    true - export tariff; false - import tariff
   * @returns {JSON | undefined}    JSON structure of the tariff details or undefined
   */
  getTariffDirection(isExport, accountData) {
    let tariff = undefined;
    const agreementsList = accountData?.data?.account?.electricityAgreements;

    if (Array.isArray(agreementsList)) {
      for (const agreementSet of agreementsList) {
        const found = agreementSet.meterPoint?.agreements?.find(
          (a) => a.tariff?.isExport === isExport
        );

        if (found) {
          tariff = found.tariff;
          break;
        }
      }
    }

    return tariff;
  }

  /**
   * Return the prices for the accounts import or export tariff
   * @param   {string}    atTime        String representation of the event date and time
   * @param   {boolean}   direction     True: export tariff; False: import tariff
   * @returns {object}                  JSON tariff price structure or undefined if no prices available atTime
   */
  getTariffDirectionPrices(atTime, direction, accountData) {
    const tariff = this.getTariffDirection(direction, accountData);
    if (tariff !== undefined) {
      const prices = this.getPrices(atTime, tariff);
      return prices;
    } else {
      return undefined;
    }
  }

  /**
   * Get the price slot details of the next slot returning default values if not present
   * @param 	{string}	slotStart		Start datetime in ISO format
   * @param 	{boolean} direction		True - export; false - import 
   * @param 	{boolean} halfHourly	True - tariff has slots; false - no slots
   * @returns {object}							Price slot structure with empty values if absent
   */
  getNextTariffSlotPrices(slotStart, halfHourly, direction, accountData) {
    let nextPrices = undefined;
    if (slotStart !== null) {
      nextPrices = this.getTariffDirectionPrices(slotStart, direction, accountData);
    }
    if (nextPrices === undefined) {
      nextPrices = this.getEmptyPriceSlot(slotStart, halfHourly);
    }
    return nextPrices;
  }

  /**
   * Indicate whether next day prcies are available
   * @param		{string}		atTime				DateTime that is sometime "today"
   * @param		{boolean}		direction			True for export, false for import
   * @returns {any}											Null if not half-hourly tariff; True if half-hourly and prices present; False otherwise
   */
  getTomorrowsPricesPresent(atTime, direction, accountData) {
    const nextDay = (this.getLocalDateTime(new Date(atTime))).plus({ days: 1 });
    const nextDayPrices = this.getTariffDirectionPrices(nextDay.toISO(), direction, accountData);
    let present = false;
    if (nextDayPrices === undefined) {
      present = false;
    } else {
      if (('isHalfHourly' in nextDayPrices) && nextDayPrices.isHalfHourly) {
        present = true;
      } else {
        present = null;
      }
    }
    return present;
  }

  /**
   * Get date/time in Homey timezone
   * @param		{Date}				jsDate			JS Date object
   * @returns {DateTime}								DateTime object in Homey's timezone
   */
  getLocalDateTime(jsDate) {
    const dateTime = DateTime.fromJSDate(jsDate).setZone(this._timeZone);
    return dateTime;
  }

  /**
   * Indicate whether a tariff is halfHourly or simple
   * @param 		{boolean} 		direction		True: export; False: import 
   * @returns 	{boolean}									True: halfHourly tariff; False: simple tariff
   */
  isHalfHourly(direction) {
    const tariff = this.getTariffDirection(direction);
    const priceSlots = 'unitRates' in tariff;
    return priceSlots;
  }

  /**
   * Return the prices for a tariff for the timeslot immediately preceding the time specified
   * @param   {string}          atTime    ISO format timestamp string
   * @param   {object - JSON}   tariff    Tariff data structure
   * @returns {object - JSON}   {preVatUnitRate, unitRate, preVatStandingCharge, standingCharge, ...}; undefined if no prices available
   */
  getPrices(atTime, tariff) {
    let prices = undefined;

    if (tariff && "unitRates" in tariff) {
      const target = DateTime.fromISO(atTime, { zone: this._timeZone });
      const targetMs = target.toMillis();
      const tomorrowMs = target.plus({ days: 1 }).startOf('day').toMillis();

      const selectedRate = tariff.unitRates.find(rate => {
        const start = DateTime.fromISO(rate.validFrom, { zone: this._timeZone }).toMillis();
        const end = DateTime.fromISO(rate.validTo, { zone: this._timeZone }).toMillis();
        return start <= targetMs && end > targetMs;
      });

      if (selectedRate) {
        const windowRates = tariff.unitRates.filter(rate => DateTime.fromISO(rate.validTo, { zone: this._timeZone }).toMillis() <= tomorrowMs);

        if (windowRates.length > 0) {
          const values = windowRates.map(rate => rate.value);
          const minPrice = Math.min(...values);
          const maxPrice = Math.max(...values);
          const quartileStep = (maxPrice - minPrice) / 4 || 0; // Avoid division by zero

          prices = {
            preVatUnitRate: selectedRate.preVatValue,
            unitRate: selectedRate.value,
            preVatStandingCharge: tariff.preVatStandingCharge,
            standingCharge: tariff.standingCharge,
            nextSlotStart: selectedRate.validTo,
            thisSlotStart: selectedRate.validFrom,
            quartile: Math.min(3, Math.floor((selectedRate.value - minPrice) / quartileStep)),
            isHalfHourly: true
          };
        }
      }
    } else if (tariff) {
      const startTime = DateTime.fromISO(atTime, { zone: this._timeZone }).startOf('day');
      prices = {
        preVatUnitRate: tariff.preVatUnitRate,
        unitRate: tariff.unitRate,
        preVatStandingCharge: tariff.preVatStandingCharge,
        standingCharge: tariff.standingCharge,
        nextSlotStart: startTime.plus({ days: 1 }).toISO(),
        thisSlotStart: startTime.toISO(),
        isHalfHourly: false,
        quartile: null
      };
    }

    return prices;
  }

  /**
   * Return the device details for the specified device ID
   * @param   {string}        id    Device ID
   * @returns {JSON|undefined}      Device data structure or undefined if no device with the specified ID
   */
  getDevice(id, accountData = undefined) {
    const devices = accountData?.data?.devices;
    if (!Array.isArray(devices)) return undefined;
    return devices.find(device => device.id === id);
  }

  /**
   * Translate the device status to a human readable string
   * @param   {string}        status    Device status
   * @returns {string}                  Human readable string or null if no translation available
   */
  translateDeviceStatus(status) {
    let translation = null;
    if (status in this._valid_device_status_translations) {
      translation = this._valid_device_status_translations[status];
    }
    return translation;
  }

  /**
   * 
   * @param   {string} accountId      The account to retrieve pairing data for
   * @returns {promise<string|undefined>}      The data to process for pairing
   */
  async getPairingData(accountId) {
    const pairingQuery = this.pairingDataQuery(accountId);
    const pairingData = await this._dataFetcher.getDataUsingGraphQL(pairingQuery, this.accessParameters.apiKey);
    return pairingData;
  }

  /**
   * Return the GraphQL query string for essential device pairing data
   * @param   {string} accountId  Used as the query parameter
   * @returns {string}            Stringified JSON representing the query
   */
  pairingDataQuery(accountId) {
    return Queries.getPairingData(accountId);
  }

  /**
   * Return the GraphQL query string to obtain the Octopus Account Information
   * @param   {string} accountId  used as the query parameter 
   * @returns {string}            Stringified JSON representing the query
   */
  accountDataQuery(accountId) {
    return Queries.getAccountData(accountId);
  }

  /**
   * Access the account data using the current access parameters and make the data retrieved current
   * @returns {Promise<Object|undefined>}           The account data; undefined if access failed
   */
  async accessAccountGraphQL() {
    this._driver.homey.log("krakenAccountWrapper.accessAccountGraphQL: Starting.");
    const accountQuery = this.accountDataQuery(this.accountId);
    const accountData = await this._dataFetcher.getDataUsingGraphQL(accountQuery, this.accessParameters.apiKey);
    if (accountData !== undefined) {
      // //TODO: REMOVE THIS GASH CODE
      // accountData.data.devices = [
      //   {
      //     id: "00000000-000a-4000-8020-15ffff00d84d",
      //     name: null,
      //     status: {
      //       currentState: "SMART_CONTROL_NOT_AVAILABLE"
      //     }
      //   },
      //   {
      //     id: "00000000-0009-4000-8020-0000000181f6",
      //     name: "TEST TEST TEST",
      //     status: {
      //       currentState: "SMART_CONTROL_IN_PROGRESS"
      //     }
      //   }
      // ];
      // //TODO: END GASH
      this._driver.homey.log(`krakenAccountWrapper.accessAccountGraphQL: Access success:`);
    } else {
      this._driver.homey.log("krakenAccountWrapper.accessAccountGraphQL: Access failed.");
    }
    return accountData;
  }

  /**
   * Get the product and tariff JSON for all MPAN on the account
   * @returns {Promise<object>} JSON containing the productId and tariffId
   */
  async getOctopusDeviceDefinitions() {
    this._driver.homey.log("krakenAccountWrapper.getOctopusDeviceDefinitions: Starting");

    const pairingData = await this.getPairingData(this.accountId)
    if (!pairingData) {
      throw new Error("Failed to retrieve pairing data from Kraken");
    }

    const account = pairingData?.data?.account;
    const devices = pairingData?.data?.devices || [];

    // //TODO: REMOVE THIS GASH CODE
    // devices = [
    //   {
    //     id: "00000000-000a-4000-8020-15ffff00d84d",
    //     name: null,
    //     status: {
    //       currentState: "SMART_CONTROL_NOT_AVAILABLE"
    //     }
    //   },
    //   {
    //     id: "00000000-0009-4000-8020-0000000181f6",
    //     name: "TEST TEST TEST",
    //     status: {
    //       currentState: "SMART_CONTROL_IN_PROGRESS"
    //     }
    //   }
    // ];
    // //TODO: END GASH

    const validStatusCodes = Object.keys(this._valid_device_status_translations);
    const dispatchableDevices = devices.filter(device =>
      validStatusCodes.includes(device.status?.currentState)
    );
    const isDispatchable = dispatchableDevices.length > 0;

    const hasExportTariff = account?.electricityAgreements?.some(agreement =>
      agreement.meterPoint?.agreements?.[0]?.tariff?.isExport === true
    ) || false;

    const billingDate = account?.billingOptions?.currentBillingPeriodStartDate;
    let periodStartDay = 1;
    if (billingDate) {
      periodStartDay = DateTime.fromISO(billingDate).minus({ days: 1 }).day;
    }

    const definitions = [];

    if (account?.electricityAgreements) {
      for (const agreement of account.electricityAgreements) {
        const tariff = agreement.meterPoint?.agreements?.[0]?.tariff;
        if (!tariff) continue;

        const direction = tariff.isExport ? "Export" : "Import";
        const isHalfHourly = tariff.__typename === 'HalfHourlyTariff';

        definitions.push({
          name: `${direction} Tariff`,
          data: { id: `${this.accountId} ${direction}` },
          settings: {
            periodStartDay: periodStartDay
          },
          store: {
            octopusClass: "octopusTariff",
            isExport: !!tariff.isExport,
            isHalfHourly: isHalfHourly,
            isDispatchable: isDispatchable
          },
          icon: `/${direction.toLowerCase()}.svg`
        });
      }
    }

    definitions.push({
      name: "Octopus Account",
      data: { id: `${this.accountId} Octopus Account` },
      settings: {
        periodStartDay: periodStartDay
      },
      store: {
        octopusClass: "octopusAccount",
        hasExport: hasExportTariff
      },
      icon: "/account.svg"
    });

    for (const device of dispatchableDevices) {
      definitions.push({
        name: device.name || "Unknown Device",
        data: { id: device.id },
        settings: {
          periodStartDay: periodStartDay
        },
        store: {
          octopusClass: "smartDevice",
          deviceId: device.id // Just the ID as requested
        },
        icon: "/device.svg"
      });
    }

    return definitions;
  }

  /**
   * Return the minimum price for the tariff for the day
   * @param   {string}    atTime    Datetime of the current event
   * @param   {boolean}   isExport  True iff export tariff, false otherwise
   * @returns {float}               The minimum price for the day  
   */
  minimumPriceOnDate(atTime, isExport, accountData) {
    const tariff = this.getTariffDirection(isExport, accountData);
    let minimumPrice = 0;

    if (!tariff) return undefined;

    if (Array.isArray(tariff.unitRates)) {
      const boundaryMs = DateTime.fromISO(atTime, { zone: this._timeZone })
        .plus({ days: 1 })
        .startOf('day')
        .toMillis();

      const validRates = tariff.unitRates
        .filter(rate => DateTime.fromISO(rate.validFrom, { zone: this._timeZone }).toMillis() < boundaryMs)
        .map(rate => rate.value);

      if (validRates.length > 0) {
        minimumPrice = Math.min(...validRates);
      }
    } else if ('nightRate' in tariff) {
      minimumPrice = tariff.nightRate;
    } else {
      minimumPrice = tariff.dayRate || 0;
    }

    return minimumPrice;
  }

  /**
   * Return live meter data from the instantiated live meter device
   * @returns {Promise<object>} reading JSON object representing the current data
   */
  async getLiveMeterData(atTime, meterId, accountData) {
    //this._driver.log(`krakenAccountWrapper.getLiveMeterData: meterId ${meterId}`);
    const deviceIds = this.getDeviceIds(accountData);
    const meterQuery = this.buildDispatchQuery(meterId, deviceIds, atTime);
    const result = {
      reading: undefined,
      dispatches: {}
    };
    const response = await this._dataFetcher.getDataUsingGraphQL(meterQuery, this.accessParameters.apiKey);
    if ((response !== undefined) && ("data" in response)) {
      const readingArray = response.data.smartMeterTelemetry;
      if ((readingArray !== null) && (Array.isArray(readingArray)) && (readingArray.length > 0)) {
        result.reading = readingArray[0];
      }
      // //TODO: REMOVE THIS GASH CODE
      // let today = this.getLocalDateTime(new Date()).set({ second: 0, millisecond: 0 });
      // let xDispatches = {
      //   d00000000_0009_4000_8020_0000000181f6: [
      //     {
      //       end: today.set({ hour: 12, minute: 50 }).toISO(), //"2025-10-25T12:50:00+00:00",
      //       energyAddedKwh: -11.618,
      //       start: today.set({ hour: 12, minute: 36 }).toISO(), //"2025-10-25T12:36:00+00:00",
      //       type: "SMART"
      //     },
      //     {
      //       end: today.set({ hour: 15, minute: 30 }).toISO(), //"2025-10-25T15:30:00+00:00",
      //       energyAddedKwh: -11.618,
      //       start: today.set({ hour: 13, minute: 56 }).toISO(), //"2025-10-25T13:56:00+00:00",
      //       type: "SMART"
      //     },
      //     {
      //       end: today.set({ hour: 17, minute: 30 }).toISO(), //"2025-10-25T15:30:00+00:00",
      //       energyAddedKwh: -11.618,
      //       start: today.set({ hour: 16, minute: 15 }).toISO(), //"2025-10-25T13:56:00+00:00",
      //       type: "SMART"
      //     },
      //     {
      //       end: today.set({ hour: 19, minute: 0 }).toISO(), //"2025-10-25T17:45:00+00:00",
      //       energyAddedKwh: -3.417,
      //       start: today.set({ hour: 18, minute: 15 }).toISO(), //"2025-10-25T19:30:00+00:00",
      //       type: "SMART"
      //     },
      //     {
      //       end: today.set({ hour: 19, minute: 45 }).toISO(), //"2025-10-25T17:45:00+00:00",
      //       energyAddedKwh: -3.417,
      //       start: today.set({ hour: 19, minute: 10 }).toISO(), //"2025-10-25T19:30:00+00:00",
      //       type: "SMART"
      //     },
      //     {
      //       end: today.plus({ days: 1 }).set({ hour: 6, minute: 0 }).toISO(), //"2025-10-26T06:00:00+00:00",
      //       energyAddedKwh: -70.3,
      //       start: today.set({ hour: 20, minute: 0 }).toISO(), //"2025-10-25T20:30:00+00:00",
      //       type: "SMART"
      //     }
      //   ],
      //   d00000000_000a_4000_8020_15ffff00d84d: null
      // };
      // response.data["d00000000_0009_4000_8020_0000000181f6"] = xDispatches["d00000000_0009_4000_8020_0000000181f6"];
      // //TODO: END GASH
      for (const deviceId of deviceIds) {
        const deviceKey = this.hashDeviceId(deviceId);
        if (Array.isArray(response.data[deviceKey])) {
          result.dispatches[deviceKey] = response.data[deviceKey];
        }
      }
    }
    return result;
  }

  /**
   * Return the dispatch with the earliest start time or undefined
   * @param       {[JSON]}    dispatchArray     Array of dispatches
   * @returns     {JSON}                        Selected dispatch or undefined
   */
  earliestDispatch(dispatchArray) {
    if (!Array.isArray(dispatchArray) || dispatchArray.length === 0) {
      return undefined;
    }

    const earliest = dispatchArray.reduce((prev, curr) => {
      const prevTime = new Date(prev.start).getTime();
      const currTime = new Date(curr.start).getTime();

      return currTime < prevTime ? curr : prev;
    });

    return earliest;
  }

  /**
   * Return the planned dispatches that start after the specified time
   * @param       {string}    atTime            Time to check against
   * @param       {[JSON]}    plannedDispatches Array of dispatches
   * @returns     {[JSON]}                      Selected dispatches
   */
  futureDispatches(atTime, plannedDispatches) {
    const eventTime = this.getLocalDateTime(new Date(atTime));
    const selectedItems = plannedDispatches.filter((dispatch) => this.getLocalDateTime(new Date(dispatch.start)) > eventTime);
    return selectedItems;
  }

  /**
   * Return the dispatch that is currently active from an array of planned dispatches, using extended times
   * @param       {string}    atTime            Time to check against
   * @param       {[JSON]}    plannedDispatches Array of dispatches
   * @returns     {JSON}                        Selected dispatch or undefined
   */
  currentExtendedDispatch(atTime, plannedDispatches) {
    const eventTime = this.getLocalDateTime(new Date(atTime));
    const selectedDispatches = plannedDispatches.filter((dispatch) =>
      (this.advanceTime(dispatch.start) < eventTime) &&
      (this.extendTime(dispatch.end) > eventTime)
    );
    return (selectedDispatches.length == 0) ? undefined : selectedDispatches[0];
  }

  /**
   * Return the dispatch that is currently active from an array of planned dispatches using planned times
   * @param       {string}    atTime            Time to check against
   * @param       {[JSON]}    plannedDispatches Array of dispatches
   * @returns     {JSON}                        Selected dispatch or undefined
   */
  currentPlannedDispatch(atTime, plannedDispatches) {
    const eventTime = this.getLocalDateTime(new Date(atTime));
    const selectedDispatches = plannedDispatches.filter((dispatch) =>
      (this.getLocalDateTime(new Date(dispatch.start)) < eventTime) &&
      (this.getLocalDateTime(new Date(dispatch.end)) > eventTime)
    );
    return (selectedDispatches.length == 0) ? undefined : selectedDispatches[0];
  }

  /**
   * Advance a start time to the preceding 30 minute boundary (00 or 30 minutes past the hour) 
   * @param   {string}      time     String datetime to be advanced, in ISO format
   * @returns {DateTime}             <time> advanced to the preceding 30 minute boundary
   */
  advanceTime(time) {
    const dateTime = this.getLocalDateTime(new Date(time));
    return this.retardDateTime(dateTime);
  }

  /**
   * Extend an end time to the following 30 minute boundary (00 or 30 minutes past the hour)
   * @param   {string}        time    String datetime to be extend, in ISO format 
   * @returns {DateTime}              <time> extended to the following 30 minute boundary
   */
  extendTime(time) {
    //Advance the time by 30 minutes, then retard the result
    const dateTime = this.getLocalDateTime(new Date(time)).plus({ minutes: 29 });
    return this.retardDateTime(dateTime);
  }

  /**
   * Retard a dateTime to the nearest preceding 30 minute boundary (00 or 30 minutes past the hour)
   * @param   {DateTime}    dateTime  Datetime to be retarded
   * @returns {DateTime}              Retarded datetime
   */
  retardDateTime(dateTime) {
    const newMinute = (dateTime.minute < 30) ? 0 : 30;
    const advancedTime = dateTime.set({ minute: newMinute, second: 0, millisecond: 0 });
    return advancedTime;
  }

  /**
   * Build the live data query using the live meter Id and intelligent device Ids
   * @param   {string}      meterId     The id of the live meter (e.g. Octopus Home Mini) 
   * @param   {string[]}    deviceIds   Array of intelligent device Ids  
   * @param   {string}      atTime      The time at which to get the data
   * @returns {object}                  JSON result of Graph QL query
   */
  buildDispatchQuery(meterId, deviceIds, atTime) {
    // 1. Logic-Heavy calculation (State/Context)
    const endTime = this.getLocalDateTime(new Date(atTime)).set({ seconds: 0, milliseconds: 0 });
    const startTime = endTime.minus({ minutes: 1 });

    // 2. Prepare the device array for the factory
    const preparedDevices = Object.keys(deviceIds).map(key => ({
      label: this.hashDeviceId(deviceIds[key]),
      id: deviceIds[key]
    }));

    // 3. Call the Stateless Factory
    return Queries.getHighFrequencyData(
      meterId,
      preparedDevices,
      startTime.toISO(),
      endTime.toISO()
    );
  }

  /**
   * Hash a deviceId into a valid GQL query label
   * @param   {string}    deviceId    DeviceId to be hashed 
   * @returns {string}                Hashed deviceId usable as a GQL query label        
   */
  hashDeviceId(deviceId) {
    return `d${deviceId.replaceAll("-", "_")}`;
  }

  /**
   * Return a price slot structure with appropriate values for a missing slot
   * @param 	{string}	start				Start datetime in ISO format or null
   * @param 	{boolean} halfHourly	True - tariff has slots; false - no slots
   */
  getEmptyPriceSlot(start, halfHourly) {
    const nextPrices = {
      preVatUnitRate: null,
      unitRate: null,
      preVatStandingCharge: null,
      standingCharge: null,
      nextSlotStart: null,
      thisSlotStart: start,
      isHalfHourly: halfHourly,
      quartile: null
    };
    return nextPrices;
  }

  /**
   * Get the current balance of the account from account data
   * @returns {float}         Balance amount
   */
  getCurrentBalance(accountData) {
    const pence = accountData?.data?.account?.balance;
    const value = (typeof pence === 'number') ? Math.round(pence) / 100 : 0;
    return value;
  }

}