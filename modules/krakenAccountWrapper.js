'use strict';

const { DateTime } = require('../bundles/luxon');
const dataFetcher = require('./dataFetcher');
const DataExtractor = require('./dataExtractor');
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

  // get extractor() {
  //   if (!this._extractor) {
  //     this._extractor = new dataExtractor();
  //   }
  //   return this._extractor;
  // }

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
        const account = DataExtractor.extractAccountData(queryResultData);
        const importTariff = DataExtractor.extractTariffData(atTimeMillis, false, queryResultData, this.timeZone);
        const exportTariff = DataExtractor.extractTariffData(atTimeMillis, true, queryResultData, this.timeZone);
        const devices = DataExtractor.extractDeviceData(deviceData);

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
      const event = DateTime.fromMillis(nowMillis, { zone: this.timeZone });
      const lastEvent = DateTime.fromMillis(lastTimestamp, { zone: this.timeZone });
      const importSlotEndMillis = Date.parse(this._driver.homey.app.importTariff.slotEnd);
      const importSlotEnd = importSlotEndMillis ? DateTime.fromMillis(importSlotEndMillis, { zone: this.timeZone }) : DateTime.fromMillis(0, { zone: this.timeZone });
      const exportSlotEndMillis = Date.parse(this._driver.homey.app.exportTariff.slotEnd);
      const exportSlotEnd = exportSlotEndMillis ? DateTime.fromMillis(exportSlotEndMillis, { zone: this.timeZone }) : DateTime.fromMillis(0, { zone: this.timeZone });
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
   * Get the product and tariff JSON for all MPAN on the account
   * @returns {Promise<object[]>} Array of kraken homey device definitions 
   */
  async getOctopusDeviceDefinitions() {
    this._driver.homey.log("krakenAccountWrapper.getOctopusDeviceDefinitions: Starting");

    const definitions = await this.getPairingData(this.accountId, (rawParingData) => {
      return DataExtractor.extractDeviceDefinitions(rawParingData, this._pairable_device_status_translations, this.accountId);
    })

    if (!definitions) {
      throw new Error("Failed to retrieve device definitions from Kraken");
    }

    return definitions;
  }

  /**
   * Return live meter data from the instantiated live meter device
   * @param   {number}          atTimeMillis  Datetime of the current event in milliseconds since the epoch
   * @param   {string}          liveMeterId   The meter ID of the live meter device
   * @param   {string[]}        deviceIds     Array of device ids
   * @returns {Promise<object>}               Reading JSON object representing the current data
   */
  async getLiveMeterData(atTimeMillis, liveMeterId, deviceIds) {
    const meterQuery = this.fetcher.buildDispatchQuery(this.accountId, liveMeterId, deviceIds, atTimeMillis);

    return await this.fetcher.getDataUsingGraphQL(
      meterQuery,
      this.accessParameters.apiKey,
      (queryResultData) => {

        const reading = DataExtractor.extractLiveReading(queryResultData);
        const deviceData = (!TestData) ? queryResultData?.data?.devices || [] : TestData.getMockDeviceStatuses();
        const deviceStates = DataExtractor.extractDeviceStatuses(deviceData, deviceIds);
        const dispatches = DataExtractor.extractAllDeviceDispatches(queryResultData, deviceStates, this.timeZone);
        return { reading, dispatches, deviceStates };   //Return from the closure
      }
    );
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
    //return `d${deviceId.replaceAll("-", "_")}`;
    return DataExtractor.hashDeviceId(deviceId);
  }

}