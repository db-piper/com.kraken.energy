'use strict';

const { DateTime } = require('../bundles/luxon');
const dataFetcher = require('./dataFetcher');
const Queries = require('./gQLQueries');
const { TokenSetting, TokenExpirySetting, ApiKeySetting, AccountIdSetting, EventTime, ImportTariff, ExportTariff, LiveMeterId, DeviceIds, PeriodStartDay, DeviceSettingNames } = require('./constants');

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
      SMART_CONTROL_CAPABLE: `Nothing Planned`,
      SMART_CONTROL_IN_PROGRESS: `Being Controlled`,
      BOOSTING: `Device Boosting`,
      SMART_CONTROL_OFF: `Smart Control Off`,
      LOST_CONNECTION: `Device Connection Lost`
    };
    this._dispatchable_device_status = ["SMART_CONTROL_CAPABLE", "SMART_CONTROL_IN_PROGRESS", "BOOSTING"];
    this._timeZone = this._driver.homey.clock.getTimezone();
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
    if (!this._fetcher) {
      this._fetcher = new dataFetcher(this._driver.homey);
    }
    return this._fetcher;
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
   * @param   {object} accountData  Account data from Kraken
   * @returns {string}              Live meter ID
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
   * Indicate if tomorow's prices are available
   * @param             {number}        atTimeMillis     Time in epoch milliseconds
   * @param             {object}        tariff           The tariff data to check
   * @returns {any}                                      Null if not half-hourly tariff; True if half-hourly and prices present; False otherwise
   */
  hasTomorrowsPricesPresent(atTimeMillis, tariff) {
    const tomorrow = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone }).plus({ days: 1 }).toMillis();
    const nextDayPrices = this.getPrices(tomorrow, tariff);
    return (nextDayPrices === undefined) ? false : (nextDayPrices?.isHalfHourly === true) ? true : null;
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
      const selectedRate = tariff.unitRates.find(rate => {
        const start = Date.parse(rate.validFrom);
        const end = Date.parse(rate.validTo);
        return start <= atTimeMillis && end > atTimeMillis;
      });

      if (selectedRate) {
        let minPrice = Infinity;
        let maxPrice = -Infinity;
        const tomorrowMs = DateTime.fromMillis(atTimeMillis, { zone: this.timeZone }).plus({ days: 1 }).startOf('day').toMillis();

        // Optimized single-pass loop to find Min/Max for Today
        for (const rate of tariff.unitRates) {
          //const rateEndMs = DateTime.fromISO(rate.validTo, { zone: this.timeZone }).toMillis();
          const rateEndMs = Date.parse(rate.validTo);

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
          nextSlotStart: `${selectedRate.validTo}`,
          thisSlotStart: `${selectedRate.validFrom}`,
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
   * Retrieve pairing data for the account
   * @param   {string}                     accountId          The account to retrieve pairing data for
   * @param   {function}                   transformFunction  Function to transform the pairing data
   * @returns {promise<string|undefined>}                     The Pairing definitions of available kraken homey devices
   */
  async getPairingData(accountId, transformFunction = null) {
    const pairingQuery = Queries.getPairingData(accountId);
    const pairingData = await this.fetcher.getDataUsingGraphQL(
      pairingQuery,
      this.accessParameters.apiKey,
      transformFunction
    );
    return pairingData;
  }

  /**
   * Access the account data using the current access parameters and make the data retrieved current
   * @param   {number}                    atTimeMillis  The time in milliseconds to get the prices for
   * @returns {Promise<Object|undefined>}               Extracts from kraken account data; undefined if access failed
   */
  async accessAccountGraphQL(atTimeMillis) {
    this._driver.homey.log("krakenAccountWrapper.accessAccountGraphQL: Starting.");
    const accountQuery = Queries.getAccountData(this.accountId);
    const accountData = await this.fetcher.getDataUsingGraphQL(
      accountQuery,
      this.accessParameters.apiKey,
      (queryResultData) => {
        // 1. Resolve source for devices (No mutation of rawjson)
        const deviceData = (!TestData) ? queryResultData?.data?.devices : TestData.getMockDevices();

        // 2. Extract atomized data
        //TODO: Refactor these calls to consistently pass fragments rather than the whole queryDataResult
        const account = this.extractAccountData(queryResultData);
        const importTariff = this.extractTariffData(atTimeMillis, false, queryResultData);
        const exportTariff = this.extractTariffData(atTimeMillis, true, queryResultData);
        const devices = this.extractDeviceData(deviceData);

        // 3. Assemble final object
        return { account, importTariff, exportTariff, devices };  //RETURN from closure function
      }
    );

    if (accountData) {
      return accountData;
    } else {
      return { account: undefined, importTariff: undefined, exportTariff: undefined, devices: undefined };
    }
  }

  /**
   * Check if any time-based boundaries have been crossed since the last event
   * @param   {number} nowMillis      Current event time in milliseconds
   * @param   {number} lastTimestamp  Last event time in milliseconds
   * @returns {object}                Flags indicating which boundaries were crossed
   */
  checkTimeBoundaries(nowMillis, lastTimestamp) {
    const periodChanges = {
      chunk: true,
      day: true,
      tariffSlotImport: true,
      tariffSlotExport: true,
      invoicePeriod: true
    };

    if (lastTimestamp) {
      const event = DateTime.fromMillis(nowMillis);
      const lastEvent = DateTime.fromMillis(lastTimestamp);
      const importSlotEndMillis = Date.parse(this._driver.homey.app.importTariff.slotEnd);
      const importSlotEnd = importSlotEndMillis ? DateTime.fromMillis(importSlotEndMillis) : DateTime.fromMillis(0);
      const exportSlotEndMillis = Date.parse(this._driver.homey.app.exportTariff.slotEnd);
      const exportSlotEnd = exportSlotEndMillis ? DateTime.fromMillis(exportSlotEndMillis) : DateTime.fromMillis(0);
      const periodStartDay = this._driver.homey.app.periodStartDay;

      periodChanges.chunk = Math.floor(nowMillis / 1800000) !== Math.floor(lastTimestamp / 1800000);
      periodChanges.day = event.day !== lastEvent.day;
      periodChanges.tariffSlotImport = event >= importSlotEnd || periodChanges.day;
      periodChanges.tariffSlotExport = event >= exportSlotEnd || periodChanges.day;
      periodChanges.invoicePeriod = periodChanges.day && event.day === periodStartDay;
    }

    return periodChanges
  }

  /**
   * Extract simple device definitions from the devices array
   * @param   {object}              devices     devices data from Kraken
   * @returns {object | undefined}              set of extracted device definitions
   */
  extractDeviceData(devices) {
    if (!devices || !Array.isArray(devices)) return undefined;
    const deviceExtracts = {};
    for (const device of devices) {
      const deviceExtract = {};
      deviceExtract.id = `${device.id}`;
      deviceExtract.hashDeviceId = this.hashDeviceId(deviceExtract.id);
      deviceExtract.name = `${device.name}`;
      deviceExtract.currentState = `${device.status?.currentState || ''}`;
      deviceExtract.currentStateTitle = this.translateDeviceStatus(deviceExtract.currentState);
      deviceExtracts[deviceExtract.hashDeviceId] = deviceExtract;
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
      accountExtract.balance = account.balance;                                                             //number, pence
      accountExtract.billingStartDate = `${account?.billingOptions?.currentBillingPeriodStartDate || ''}`;  //string, YYYY-MM-DD
      accountExtract.liveMeterId = `${this.getLiveMeterId(accountData) || ''}`;                             //string
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
    if (!tariffDefinition) return { present: false };

    const pricesNow = this.getPrices(atTimeMillis, tariffDefinition);
    // Use a clean local variable for calculations
    const slotEndStr = `${pricesNow.nextSlotStart || ''}`;
    const slotEndMs = Date.parse(slotEndStr);
    const pricesNext = this.getPrices(slotEndMs, tariffDefinition);

    return {
      present: true,
      productCode: `${tariffDefinition.productCode}`,
      tariffCode: `${tariffDefinition.tariffCode}`,
      isExport: !!isExport,
      isHalfHourly: tariffDefinition.__typename === 'HalfHourlyTariff',
      // Ensure these return primitives only:
      hasTomorrowsPrices: !!this.hasTomorrowsPricesPresent(atTimeMillis, tariffDefinition),
      unitRate: pricesNow.unitRate,
      preVatUnitRate: pricesNow.preVatUnitRate,
      standingCharge: pricesNow.standingCharge,
      taxRate: 100 * (pricesNow.unitRate - pricesNow.preVatUnitRate) / pricesNow.preVatUnitRate,
      minimumPriceToday: this.minimumTariffPrice(atTimeMillis, tariffDefinition),
      maximumPriceToday: this.maximumTariffPrice(atTimeMillis, tariffDefinition),
      slotStart: `${pricesNow.thisSlotStart}`,
      slotStartShort: DateTime.fromISO(pricesNow.thisSlotStart, { zone: this.timeZone }).toFormat('dd/LL T'),
      slotEnd: slotEndStr,
      slotEndShort: DateTime.fromMillis(slotEndMs, { zone: this.timeZone }).toFormat('dd/LL T'),
      slotQuartile: pricesNow.quartile,
      nextUnitPrice: pricesNext?.unitRate ?? null,
      nextSlotEnd: pricesNext ? `${pricesNext.nextSlotStart}` : null,
      nextSlotEndShort: pricesNext ? DateTime.fromISO(pricesNext.nextSlotStart, { zone: this.timeZone }).toFormat('dd/LL T') : null,
      nextSlotQuartile: pricesNext?.quartile ?? null
    };
  }

  /**
   * Get the product and tariff JSON for all MPAN on the account
   * @returns {Promise<object[]>} Array of kraken homey device definitions 
   */
  async getOctopusDeviceDefinitions() {
    this._driver.homey.log("krakenAccountWrapper.getOctopusDeviceDefinitions: Starting");

    const definitions = await this.getPairingData(this.accountId, (rawParingData) => {
      return this.extractDeviceDefinitions(rawParingData);
    })

    if (!definitions) {
      throw new Error("Failed to retrieve device definitions from Kraken");
    }

    return definitions;
  }

  /**
   * Surgical extraction of account/device definitions from raw pairing data
   * @param   {object}    rawPairingData    pairing data from Kraken
   * @returns {object[]}                    array of extracted kraken device definitions
   */
  extractDeviceDefinitions(rawPairingData) {
    if (!this.getLiveMeterId(rawPairingData)) {
      return [];
    }

    const account = rawPairingData?.data?.account;

    // Preferred TestData formulation
    const rawDevices = (!TestData) ? (rawPairingData?.data?.devices || []) : TestData.getMockDevices();

    const validStatusCodes = Object.keys(this._pairable_device_status_translations);
    const dispatchableDevices = rawDevices.filter(device =>
      validStatusCodes.includes(device.status?.currentState)
    );
    const isDispatchable = dispatchableDevices.length > 0;

    const hasExportTariff = account?.electricityAgreements?.some(agreement =>
      agreement.meterPoint?.agreements?.[0]?.tariff?.isExport === true
    ) || false;

    const hasImportTariff = account?.electricityAgreements?.some(agreement =>
      agreement.meterPoint?.agreements?.[0]?.tariff?.isExport === false
    ) || false;

    const billingDate = account?.billingOptions?.currentBillingPeriodStartDate;
    let periodStartDay = 1;
    if (billingDate) {
      periodStartDay = DateTime.fromISO(`${billingDate}`).minus({ days: 1 }).day;
    }

    const definitions = [];

    // 1. Process Tariffs
    if (account?.electricityAgreements) {
      for (const agreement of account.electricityAgreements) {
        const tariff = agreement.meterPoint?.agreements?.[0]?.tariff;
        if (!tariff) continue;

        const direction = tariff.isExport ? "Export" : "Import";
        const isHalfHourly = tariff.__typename === 'HalfHourlyTariff';

        definitions.push({
          name: `${direction} Tariff`,
          data: { id: `${this.accountId} ${direction}` },
          settings: { periodStartDay },
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

    // 2. Add Account Definition
    definitions.push({
      name: "Octopus Account",
      data: { id: `${this.accountId} Octopus Account` },
      settings: { periodStartDay },
      store: {
        octopusClass: "octopusAccount",
        hasExport: hasExportTariff,
        hasImport: hasImportTariff
      },
      icon: "/account.svg"
    });

    // 3. Add Device Definitions
    for (const device of dispatchableDevices) {
      definitions.push({
        name: `${device.name || "Unknown Device"}`,
        data: { id: `${device.id}` },
        settings: { periodStartDay },
        store: {
          octopusClass: "smartDevice",
          deviceId: `${device.id}`
        },
        icon: "/device.svg"
      });
    }

    return definitions; // clean result - pairingBlob is now eligible for GC
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
        //.filter(rate => DateTime.fromISO(rate.validFrom, { zone: this.timeZone }).toMillis() < boundaryMs)
        .filter(rate => Date.parse(rate.validFrom) < boundaryMs)
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
        .filter(rate => Date.parse(rate.validFrom) < boundaryMs)
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
   * @param   {string}          liveMeterId   The meter ID of the live meter device
   * @param   {string[]}        deviceIds     Array of device ids
   * @returns {Promise<object>}               Reading JSON object representing the current data
   */
  async getLiveMeterData(atTimeMillis, liveMeterId, deviceIds) {
    const meterQuery = this.fetcher.buildDispatchQuery(liveMeterId, deviceIds, atTimeMillis);

    return await this.fetcher.getDataUsingGraphQL(
      meterQuery,
      this.accessParameters.apiKey,
      (queryResultData) => {

        const reading = this.extractLiveReading(queryResultData);
        const deviceData = (!TestData) ? queryResultData?.data?.devices || [] : TestData.getMockDeviceStatuses();
        const deviceStates = this.extractDeviceStatuses(deviceData, deviceIds);
        const dispatches = this.extractAllDeviceDispatches(queryResultData, deviceStates, this._dispatchable_device_status);
        return { reading, dispatches, deviceStates };   //Return from the closure
      }
    );
  }

  /**
   * Extract the live meter reading from the GraphQL query result data
   * @param   {object}    queryData    The raw GraphQL query result data
   * @returns {object}                 The live meter reading
   */
  extractLiveReading(queryData) {
    const reading = queryData?.data?.smartMeterTelemetry?.[0];
    if (!reading) return undefined;

    return {
      demand: Number(reading.demand),             //Current energy w (positive import, negative export)
      export: Number(reading.export),             //Current export meter reading kWh since meter installed
      consumption: Number(reading.consumption),   //Current import meter reading kWh since meter installed
      readAt: `${reading.readAt}`                 //ISO DateTime string
    };
  }

  /**
   * Iterates through devices and extracts atomized dispatch arrays, 
   * filtered by the current operational state of the Homey devices.
   * @param {object}   rawPayload        - The raw Kraken API response.
   * @param {object[]} deviceStates      - Array of {deviceId, deviceState, title}.
   * @param {string[]} validDeviceStates - Array of allowed states (e.g., ['CONNECTED', 'CHARGING']).
   * @returns {object}                   - Keyed map of valid dispatches.
   */
  extractAllDeviceDispatches(rawPayload, deviceStates, validDeviceStates) {
    const dispatchMap = {};
    for (const { id, currentState, currentStateTitle } of deviceStates) {
      // 1. Filter Check: Is this device in a state allowed to receive dispatch minutes?
      if (!validDeviceStates.includes(currentState)) {
        continue;
      }

      const deviceKey = this.hashDeviceId(id);

      // 2. Selection logic
      const source = (!TestData)
        ? rawPayload?.data?.[deviceKey]
        : TestData.getMockDispatches(DateTime, this.timeZone)?.[deviceKey];

      if (Array.isArray(source)) {
        // 3. Transform and Map
        dispatchMap[deviceKey] = source.map(dispatch => ({
          start: `${dispatch.start}`,
          end: `${dispatch.end}`,
          energyAdded: Number(dispatch.energyAdded),
          type: `${dispatch.type || ''}`
        }));
      }
    }

    return dispatchMap;
  }

  /**
   * Extract device statuses into a clean, UI-ready array
   * @param   {object[]}  rawDevices   Devices array from query result data
   * @param   {string[]}  deviceIds    The IDs we are interested in
   * @returns {object[]}               Array of {id, status, statusTitle}
   */
  extractDeviceStatuses(rawDevices, deviceIds) {
    //const rawDevices = queryResultData?.devices || [];

    return rawDevices
      .filter(device => deviceIds.includes(device.id))
      .map(device => {
        const rawStatus = device.status?.currentState || 'UNKNOWN';
        return {
          id: device.id,
          currentState: rawStatus,
          currentStateTitle: this._pairable_device_status_translations[rawStatus] || 'Unknown Status'
        };
      });
  }

  /**
   * Return the dispatch with the earliest start time or undefined
   * @param       {[JSON]}            dispatchArray     Array of dispatches
   * @returns     {JSON | undefined}                    Selected dispatch or undefined
   */
  earliestDispatch(dispatchArray) {
    if (!Array.isArray(dispatchArray) || dispatchArray.length === 0) {
      return undefined;
    }

    const earliest = dispatchArray.reduce((prev, curr) => {
      return Date.parse(prev.start) < Date.parse(curr.start) ? prev : curr;
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
    if (!Array.isArray(plannedDispatches)) return [];
    const selectedItems = plannedDispatches.filter((dispatch) => Date.parse(dispatch.start) > atTimeMillis);
    return selectedItems;
  }

  /**
   * Core Engine: Filters dispatches based on a provided window-transformation strategy
   */
  getDispatchesInWindow(atTimeMillis, plannedDispatches, windowStrategy) {
    return plannedDispatches.filter((dispatch) => {
      const { start, end } = windowStrategy(
        Date.parse(dispatch.start),
        Date.parse(dispatch.end)
      );
      return atTimeMillis >= start && atTimeMillis < end;
    });
  }

  /**
   * Get dispatches whose extended times include the specified time (single device, flattened array from multiple devices)
   * @param       {number}    atTimeMillis        The time to find dispatches for
   * @param       {Object[]}  plannedDispatches   Array of dispatches
   * @returns     {Object[]}                      Selected dispatches whose extended times include the chunk time
   */
  getPricingDispatches(atTimeMillis, plannedDispatches) {
    const halfHour = 1800000;
    return this.getDispatchesInWindow(atTimeMillis, plannedDispatches, (start, end) => ({
      start: Math.floor(start / halfHour) * halfHour,
      end: Math.floor((end + 1799999) / halfHour) * halfHour
    }));
  }

  /**
   * Get dispatches whose planned times include the specified time (single device, flattened array from multiple devices)
   * @param       {number}    atTimeMillis        The time to find dispatches for
   * @param       {Object[]}  plannedDispatches   Array of dispatches
   * @returns     {Object[]}                      Selected dispatches whose planned times include the specified time
   */
  getPlannedDispatches(atTimeMillis, plannedDispatches) {
    return this.getDispatchesInWindow(atTimeMillis, plannedDispatches, (start, end) => ({
      start: start,
      end: end
    }));
  }

  /**
   * Hash a deviceId into a valid GQL query label
   * @param   {string}    deviceId    DeviceId to be hashed
   * @returns {string}                Hashed deviceId usable as a GQL query label
   */
  hashDeviceId(deviceId) {
    return `d${deviceId.replaceAll("-", "_")}`;
  }


}