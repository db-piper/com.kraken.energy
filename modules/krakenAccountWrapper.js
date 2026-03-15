'use strict';

const { DateTime } = require('../bundles/luxon');
const dataFetcher = require('./dataFetcher');
const Queries = require('./gQLQueries');
const { TokenSetting, TokenExpirySetting, ApiKeySetting, AccountIdSetting, EventTime, DriverSettingNames } = require('./constants');

let TestData = null;
try {
  TestData = require('../test_data');
} catch (err) {
  // TestData remains null in production
}

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
    this._driver = driver;
    this._pairable_device_status_translations = {
      SMART_CONTROL_NOT_AVAILABLE: `Device Unavailable`,
      SMART_CONTROL_CAPABLE: `Device Capable`,
      SMART_CONTROL_IN_PROGRESS: `Device Available`,
      BOOSTING: `Device Boosting`,
      SMART_CONTROL_OFF: `Smart Control Off`,
      LOST_CONNECTION: `Device Connection Lost`
    };
    this._dispatchable_device_status = ["SMART_CONTROL_CAPABLE", "SMART_CONTROL_IN_PROGRESS", "BOOSTING"];
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
   * Return the dataFetcher instance
   * @returns {dataFetcher}   dataFetcher instance
   */
  get fetcher() {
    return new dataFetcher(this._driver.homey);
  }

  /**
   * Return the timezone of the homey device
   * @returns {string}    Timezone in the form Europe/London
   */
  get timeZone() {
    return this._timeZone;
  }

  /**
   * Return a valid GQL key from the specified key or from a key stored in app settings
   * @param   {string | null}     userSpecifiedKey    A candidate key to be tested
   * @returns {Promise<string>}                       API Token
   */
  async getApiToken(userSpecifiedKey = null) {
    return await this.fetcher.getApiToken(userSpecifiedKey);
  }

  /**
   * Proves an Account ID can be accessed by the token derived from the API key and persists it.
   * @param   {string} accountId The ID to validate and store.
   * @param   {string} token     The valid JWT to use for the check.
   * @returns {Promise<boolean>}
   */
  async setValidAccount(account, token) {
    return await this.fetcher.setValidAccount(account, token);
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
   * @param   {object | undefined} devices      Map of devices registered on the account
   * @returns {string[]}                        Array of smart device IDs
   */
  getDeviceIds(devices) {
    const deviceIds = Object.values(devices)
      .filter(device => this._dispatchable_device_status.includes(device.currentState))
      .map(device => device.id);
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
   * @param   {number}    atTimeMillis  String representation of the event date and time in milliseconds
   * @param   {boolean}   direction     True: export tariff; False: import tariff
   * @returns {object}                  JSON tariff price structure or undefined if no prices available atTimeMillis
   */
  getTariffDirectionPrices(atTimeMillis, direction, accountData) {
    const tariff = this.getTariffDirection(direction, accountData);
    if (tariff !== undefined) {
      const prices = this.getPrices(atTimeMillis, tariff);
      return prices;
    } else {
      return undefined;
    }
  }

  /**
   * Get the price slot details of the next slot returning default values if not present
   * @param 	{string}	slotStart		Start datetime in ISO format from tariff slot data NOT MILLISECONDS
   * @param 	{boolean} direction		True - export; false - import 
   * @param 	{boolean} halfHourly	True - tariff has slots; false - no slots
   * @returns {object}							Price slot structure with empty values if absent
   */
  getNextTariffSlotPrices(slotStart, halfHourly, direction, accountData) {
    const slotStartMs = DateTime.fromISO(slotStart, { zone: this.timeZone }).toMillis();
    let nextPrices = undefined;
    if (slotStart !== null) {
      nextPrices = this.getTariffDirectionPrices(slotStartMs, direction, accountData);
    }
    if (nextPrices === undefined) {
      nextPrices = this.getEmptyPriceSlot(slotStart, halfHourly);
    }
    return nextPrices;
  }

  /**
   * Indicate if tomorow's prices are available
   * @param		{number}		atTimeMillis		Time in epoch milliseconds
   * @param		{object}		tariff  				The tariff data to check
   * @returns {any}								        Null if not half-hourly tariff; True if half-hourly and prices present; False otherwise
   */
  hasTomorrowsPricesPresent(atTimeMillis, tariff) {
    const tomorrow = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone }).plus({ days: 1 }).toMillis();
    const nextDayPrices = this.getPrices(tomorrow, tariff);
    return (nextDayPrices === undefined) ? false : (nextDayPrices?.isHalfHourly === true) ? true : null;
  }

  /**
   * Indicate whether next day prcies are available
   * @param		{number}		atTimeMillis		Time in epoch milliseconds
   * @param		{boolean}		direction				True for export, false for import
   * @returns {any}											  Null if not half-hourly tariff; True if half-hourly and prices present; False otherwise
   */
  getTomorrowsPricesPresent(atTimeMillis, direction, accountData) {
    const nextDay = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone }).plus({ days: 1 });
    const nextDayPrices = this.getTariffDirectionPrices(nextDay.toMillis(), direction, accountData);
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
   * Return the prices for a tariff for the timeslot immediately preceding the time specified
   * @param   {number}          atTimeMillis  Event date and time in epoch milliseconds
   * @param   {object - JSON}   tariff        Tariff data structure
   * @returns {object - JSON}   {preVatUnitRate, unitRate, preVatStandingCharge, standingCharge, ...}; undefined if no prices available
   */
  getPrices(atTimeMillis, tariff) {
    let prices = undefined;

    if (tariff && "unitRates" in tariff) {
      const target = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone });
      const targetMs = target.toMillis();
      const tomorrowMs = target.plus({ days: 1 }).startOf('day').toMillis();

      const selectedRate = tariff.unitRates.find(rate => {
        const start = DateTime.fromISO(rate.validFrom, { zone: this.timeZone }).toMillis();
        const end = DateTime.fromISO(rate.validTo, { zone: this.timeZone }).toMillis();
        return start <= targetMs && end > targetMs;
      });

      if (selectedRate) {
        let minPrice = Infinity;
        let maxPrice = -Infinity;

        // Optimized single-pass loop to find Min/Max for Today
        for (const rate of tariff.unitRates) {
          const rateEndMs = DateTime.fromISO(rate.validTo, { zone: this.timeZone }).toMillis();

          // Match original filter: only consider rates ending before or at start of tomorrow
          if (rateEndMs <= tomorrowMs) {
            if (rate.value < minPrice) minPrice = rate.value;
            if (rate.value > maxPrice) maxPrice = rate.value;
          }
        }

        // Fallback: If no window rates found, use the selectedRate itself
        if (minPrice === Infinity) {
          minPrice = selectedRate.value;
          maxPrice = selectedRate.value;
        }

        const quartileStep = (maxPrice - minPrice) / 4 || 0;

        prices = {
          preVatUnitRate: selectedRate.preVatValue,
          unitRate: selectedRate.value,
          preVatStandingCharge: tariff.preVatStandingCharge,
          standingCharge: tariff.standingCharge,
          nextSlotStart: selectedRate.validTo,
          thisSlotStart: selectedRate.validFrom,
          // Calculate quartile: 0 (cheapest) to 3 (most expensive)
          quartile: Math.min(3, Math.floor((selectedRate.value - minPrice) / (quartileStep || 1))),
          isHalfHourly: true
        };
      }
    } else if (tariff) {
      const startTime = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone }).startOf('day');
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
   * Translate the device status to a human readable string
   * @param   {string}        status    Device status
   * @returns {string}                  Human readable string or null if no translation available
   */
  translateDeviceStatus(status) {
    let translation = null;
    if (status in this._pairable_device_status_translations) {
      translation = this._pairable_device_status_translations[status];
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
    const pairingData = await this.fetcher.getDataUsingGraphQL(pairingQuery, this.accessParameters.apiKey);
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
   * @param   {number}                    atTimeMillis  The time in milliseconds to get the prices for
   * @returns {Promise<Object|undefined>}               Extracts from kraken account data; undefined if access failed
   */
  async accessAccountGraphQL(atTimeMillis) {
    this._driver.homey.log("krakenAccountWrapper.accessAccountGraphQL: Starting.");
    const accountQuery = this.accountDataQuery(this.accountId);
    const accountData = await this.fetcher.getDataUsingGraphQL(accountQuery, this.accessParameters.apiKey);
    if (accountData !== undefined) {
      accountData.data.devices = (TestData) ? TestData.getMockDevices() : (accountData?.data?.devices || []);
      this._driver.homey.log(`krakenAccountWrapper.accessAccountGraphQL: Access success:`);
      const account = this.extractAccountData(accountData);
      const importTariff = this.extractTariffData(atTimeMillis, false, accountData);
      const exportTariff = this.extractTariffData(atTimeMillis, true, accountData);
      const devices = this.extractDeviceData(accountData);
      return { account, importTariff, exportTariff, devices };
    } else {
      this._driver.homey.log("krakenAccountWrapper.accessAccountGraphQL: Access failed.");
      return { account: undefined, importTariff: undefined, exportTariff: undefined, devices: undefined };
    }
  }

  /**
   * Extract simple device definitions from the devices array
   * @param   {object}              accountData account data from Kraken
   * @returns {object | undefined}              extracted device definitions
   */
  extractDeviceData(accountData) {
    const devices = accountData?.data?.devices;
    const deviceExtracts = (devices) ? {} : undefined;
    if (devices) {
      for (const device of devices) {
        const deviceExtract = {};
        deviceExtract.id = device.id;
        deviceExtract.hashDeviceId = this.hashDeviceId(device.id);
        deviceExtract.name = device.name;
        deviceExtract.currentState = device.status?.currentState;
        deviceExtract.currentStateTitle = this.translateDeviceStatus(device.status?.currentState);
        deviceExtracts[deviceExtract.hashDeviceId] = deviceExtract;
      }
    }
    return deviceExtracts;
  }

  /**
   * Extract simple account data from the account object
   * @param   {object}               accountData account data from Kraken
   * @returns {object | undefined}               extracted account data
   */
  extractAccountData(accountData) {
    const account = accountData?.data?.account;
    const accountExtract = (account) ? {} : undefined;
    if (account) {
      accountExtract.balance = account.balance;
      accountExtract.billingStartDate = account?.billingOptions?.currentBillingPeriodStartDate;
      accountExtract.liveMeterId = this.getLiveMeterId(accountData);
    }
    return accountExtract;
  }

  /**
   * From the mass of accountData abstract the key data items required by the homey devices
   * @param   {number}               atTimeMillis  The time in milliseconds to get the prices for  
   * @param   {boolean}              isExport      True iff the required tariff is for export, false iff for import    
   * @param   {object}               accountData   The account data from Kraken
   * @returns {object | undefined}                 The extracted account data
   */
  extractTariffData(atTimeMillis, isExport, accountData) {
    const tariffDefinition = this.getTariffDirection(isExport, accountData);
    const tariffData = { present: !!tariffDefinition };                                                       //boolean
    if (tariffDefinition) {
      tariffData.productCode = tariffDefinition.productCode;                                                  //string
      tariffData.tariffCode = tariffDefinition.tariffCode;                                                    //string
      tariffData.isExport = isExport;                                                                         //boolean
      tariffData.isHalfHourly = tariffDefinition.__typename === 'HalfHourlyTariff';                           //boolean
      tariffData.hasTomorrowsPrices = this.hasTomorrowsPricesPresent(atTimeMillis, tariffDefinition);         //boolean
      const pricesNow = this.getPrices(atTimeMillis, tariffDefinition);
      tariffData.unitRate = pricesNow.unitRate;                                                               //pence
      tariffData.preVatUnitRate = pricesNow.preVatUnitRate;                                                   //pence
      tariffData.standingCharge = pricesNow.standingCharge;                                                   //pence
      tariffData.taxRate = 100 * (pricesNow.unitRate - pricesNow.preVatUnitRate) / pricesNow.preVatUnitRate;  //percent
      tariffData.minimumPriceToday = this.minimumTariffPrice(atTimeMillis, tariffDefinition);                 //pence
      tariffData.maximumPriceToday = this.maximumTariffPrice(atTimeMillis, tariffDefinition);                 //pence
      tariffData.slotStart = pricesNow.thisSlotStart;                                                         //ISO datetime
      tariffData.slotEnd = pricesNow.nextSlotStart;                                                           //ISO datetime
      tariffData.slotQuartile = pricesNow.quartile;                                                           //integer 0-3
      const slotEndDateTime = DateTime.fromISO(tariffData.slotEnd, { zone: this.timeZone }).toMillis();
      const pricesNext = this.getPrices(slotEndDateTime, tariffDefinition);
      tariffData.nextUnitPrice = (pricesNext === undefined) ? null : pricesNext.unitRate;                     //pence
      tariffData.nextSlotEnd = (pricesNext === undefined) ? null : pricesNext.nextSlotStart;                  //ISO datetime
      tariffData.nextSlotQuartile = (pricesNext === undefined) ? null : pricesNext.quartile;                  //integer 0-3
    }
    return tariffData;
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
    const devices = (TestData) ? TestData.getMockDevices() : (pairingData?.data?.devices || []);

    const validStatusCodes = Object.keys(this._pairable_device_status_translations);
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
            isDispatchable: isDispatchable && isHalfHourly && !tariff.isExport
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
   * @param   {number}    atTimeMillis      Time to check against in epoch milliseconds
   * @param   {object}    tariffDefinition  The tariff definition
   * @returns {float}                       The minimum price for the day  
   */
  minimumTariffPrice(atTimeMillis, tariffDefinition) {
    let minimumPrice = 0;

    if (!tariffDefinition) return undefined;

    if (Array.isArray(tariffDefinition.unitRates)) {
      const boundaryMs = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone })
        .plus({ days: 1 })
        .startOf('day')
        .toMillis();

      const validRates = tariffDefinition.unitRates
        .filter(rate => DateTime.fromISO(rate.validFrom, { zone: this.timeZone }).toMillis() < boundaryMs)
        .map(rate => rate.value);

      if (validRates.length > 0) {
        minimumPrice = Math.min(...validRates);
      }
    } else if ('nightRate' in tariffDefinition) {
      minimumPrice = tariffDefinition.nightRate;
    } else {
      minimumPrice = tariffDefinition.unitRate || 0;
    }

    return minimumPrice;
  }

  /**
   * Return the minimum price for the tariff for the day
   * @param   {number}    atTimeMillis      Time to check against in epoch milliseconds
   * @param   {boolean}   isExport          True iff export tariff, false otherwise
   * @param   {object}    accountData       The account data from Kraken
   * @returns {float}                       The minimum price for the day  
   */
  minimumPriceOnDate(atTimeMillis, isExport, accountData) {
    const tariffDefinition = this.getTariffDirection(isExport, accountData);
    return this.minimumTariffPrice(atTimeMillis, tariffDefinition);
  }

  /**
   * Return the maximum price for the tariff for the day
   * @param   {number}    atTimeMillis      Time to check against in epoch milliseconds
   * @param   {boolean}   isExport          True iff export tariff, false otherwise
   * @param   {object}    accountData       The account data from Kraken
   * @returns {float}                       The maximum price for the day  
   */
  maximumPriceOnDate(atTimeMillis, isExport, accountData) {
    const tariffDefinition = this.getTariffDirection(isExport, accountData);
    return this.maximumTariffPrice(atTimeMillis, tariffDefinition);
  }

  /**
   * Return the maximum price for the tariff for the day
   * @param   {number}    atTimeMillis      Time to check against in epoch milliseconds
   * @param   {object}    tariffDefinition  The tariff definition
   * @returns {float}                       The maximum price for the day  
   */
  maximumTariffPrice(atTimeMillis, tariffDefinition) {
    let maximumPrice = 0;

    if (!tariffDefinition) return undefined;

    if (Array.isArray(tariffDefinition.unitRates)) {
      const boundaryMs = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone })
        .plus({ days: 1 })
        .startOf('day')
        .toMillis();

      const validRates = tariffDefinition.unitRates
        .filter(rate => DateTime.fromISO(rate.validFrom, { zone: this.timeZone }).toMillis() < boundaryMs)
        .map(rate => rate.value);

      if (validRates.length > 0) {
        maximumPrice = Math.max(...validRates);
      }
    } else if ('dayRate' in tariffDefinition) {
      maximumPrice = tariffDefinition.dayRate;
    } else {
      maximumPrice = tariffDefinition.unitRate || 0;
    }

    return maximumPrice;
  }

  /**
   * Return live meter data from the instantiated live meter device
   * @param   {number}          atTimeMillis  Datetime of the current event in milliseconds since the epoch
   * @param   {string}          meterId       The meter ID of the device
   * @param   {array<string>}   deviceIds     Array of device IDs
   * @returns {Promise<object>}               Reading JSON object representing the current data
   */
  async getLiveMeterData(atTimeMillis, meterId, deviceIds) {
    let meterQuery = this.buildDispatchQuery(meterId, deviceIds, atTimeMillis);
    const result = {
      reading: undefined,
      dispatches: {}
    };
    let response = await this.fetcher.getDataUsingGraphQL(meterQuery, this.accessParameters.apiKey);
    if ((response !== undefined) && ("data" in response)) {
      const readingArray = response.data.smartMeterTelemetry;
      if ((readingArray !== null) && (Array.isArray(readingArray)) && (readingArray.length > 0)) {
        result.reading = { ...readingArray[0] };
      }
      if (TestData) {
        const mockDispatches = TestData.getMockDispatches(DateTime, this.timeZone);
        Object.assign(response.data, mockDispatches);
      }
      for (const deviceId of deviceIds) {
        const deviceKey = this.hashDeviceId(deviceId);
        if (Array.isArray(response.data[deviceKey])) {
          //result.dispatches[deviceKey] = response.data[deviceKey];
          result.dispatches[deviceKey] = response.data[deviceKey].map(dispatch => ({ ...dispatch }));
        }
      }
    }

    response = null;
    meterQuery = null;

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
   * @param       {number}    atTimeMillis      Time to check against in epoch milliseconds
   * @param       {[JSON]}    plannedDispatches Array of dispatches
   * @returns     {[JSON]}                      Selected dispatches
   */
  futureDispatches(atTimeMillis, plannedDispatches) {
    const eventTime = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone });
    const selectedItems = plannedDispatches.filter((dispatch) => DateTime.fromISO(dispatch.start, { zone: this.timeZone }) > eventTime);
    return selectedItems;
  }

  /**
   * Return the dispatch that is currently active from an array of planned dispatches, using extended times
   * @param       {number}    atTimeMillis      Time to check against in epoch milliseconds
   * @param       {[JSON]}    plannedDispatches Array of dispatches
   * @returns     {JSON}                        Selected dispatch or undefined
   */
  currentExtendedDispatch(atTimeMillis, plannedDispatches) {
    const eventTime = DateTime.fromMillis(atTimeMillis);
    const selectedDispatches = plannedDispatches.filter((dispatch) =>
      (this.advanceTime(dispatch.start) <= eventTime) &&
      (this.extendTime(dispatch.end) > eventTime)
    );
    return (selectedDispatches.length == 0) ? undefined : selectedDispatches[0];
  }

  /**
   * Return the dispatch that is currently active from an array of planned dispatches using planned times
   * @param       {number}    atTimeMillis      Time to check against in epoch milliseconds
   * @param       {[JSON]}    plannedDispatches Array of dispatches
   * @returns     {JSON}                        Selected dispatch or undefined
   */
  currentPlannedDispatch(atTimeMillis, plannedDispatches) {
    const eventTime = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone });
    const selectedDispatches = plannedDispatches.filter((dispatch) =>
      (DateTime.fromISO(dispatch.start, { zone: this.timeZone }) <= eventTime) &&
      (DateTime.fromISO(dispatch.end, { zone: this.timeZone }) > eventTime)
    );
    return (selectedDispatches.length == 0) ? undefined : selectedDispatches[0];
  }

  /**
   * Advance a start time to the preceding 30 minute boundary (00 or 30 minutes past the hour) 
   * @param   {string}      time     String datetime to be advanced, in ISO format from dispatch data [NOT MILLIS]
   * @returns {DateTime}             <time> advanced to the preceding 30 minute boundary
   */
  advanceTime(time) {
    const dateTime = DateTime.fromISO(time, { zone: this.timeZone });
    return this.retardDateTime(dateTime);
  }

  /**
   * Extend an end time to the following 30 minute boundary (00 or 30 minutes past the hour)
   * @param   {string}        time    String datetime to be extend, in ISO format from dispatch data [NOT MILLISECONDS]
   * @returns {DateTime}              <time> extended to the following 30 minute boundary
   */
  extendTime(time) {
    //Advance the time by 30 minutes, then retard the result
    const dateTime = DateTime.fromISO(time, { zone: this.timeZone }).plus({ minutes: 29 });
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
   * @param   {string}      meterId       The id of the live meter (e.g. Octopus Home Mini) 
   * @param   {string[]}    deviceIds     Array of intelligent device Ids  
   * @param   {number}      atTimeMillis  The time at which to get the data in milliseconds since the epoch
   * @returns {object}                    JSON result of Graph QL query
   */
  buildDispatchQuery(meterId, deviceIds, atTimeMillis) {
    // 1. Logic-Heavy calculation (State/Context)
    const endTime = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone }).startOf('minute');
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
   * @param 	{string}	start				Start datetime in ISO format or null [NOT MILLISECONDS]
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