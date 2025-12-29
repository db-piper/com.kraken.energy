'use strict';

const jsonata = require('jsonata');
const dataFetcher = require('./dataFetcher');
const { DateTime } = require('luxon');
const AccountIdSetting = "krakenAccountId";
const ApiKeySetting = "krakenApiKey";
const krakenDriver = require("../drivers/krakendevicedriver/driver");

module.exports = class krakenAccountWrapper {
  /**
   * krakenAccountWrapper obtains the account overview data via GQL and then uses jsonata to query the data structure
   * in different ways.
   */

  /**
   * Constructor for krakenAccountWrapper
   * @param {krakenDriver}   driver  managing the devices 
   */
  constructor(driver) {
    driver.homey.log(`krakenAccountWrapper.constructor: Instantiating`);
    this._driver = driver;
    this._dataFetcher = new dataFetcher(this._driver);
    this._accountData = undefined;
    this._valid_device_status_translations = {
      SMART_CONTROL_NOT_AVAILABLE: `Device Unavailable`,
      SMART_CONTROL_CAPABLE: `Device Capable`,
      SMART_CONTROL_IN_PROGRESS: `Device Available`,
      BOOSTING: `Device Boosting`,
      SMART_CONTROL_OFF: `Smart Control Off`,
      LOST_CONNECTION: `Device Connection Lost`
    };
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
   * Return the account overview
   * @returns {string} JSON representing the account overview 
   */
  get accountData() {
    return this._accountData;
  }

  /**
   * Get the live meter id on the account
   * @returns {string}      Live meter ID
   */
  async getLiveMeterId() {
    let transform = this.liveMeterTransform();
    return await jsonata(transform).evaluate(this.accountData);
  }

  async getDeviceIds() {
    const statusCodes = JSON.stringify(Object.getOwnPropertyNames(this._valid_device_status_translations));
    const transform = `[data.devices[status.currentState in ${statusCodes}].id]`;
    return await jsonata(transform).evaluate(this.accountData);
  }

  /**
   * Return tariff details for the specified direction for the account overview
   * @param   {boolean} isExport    true - export tariff; false - import tariff
   * @returns {string}              JSON structure of the tariff details or undefined
   */
  async getTariffDirection(isExport) {
    const tariffTransform = this.tariffTransform(isExport);
    const tariff = await jsonata(tariffTransform).evaluate(this.accountData);
    return tariff;
  }

  /**
   * Return the prices for the accounts import or export tariff
   * @param   {string}    atTime        String representation of the event date and time
   * @param   {boolean}   direction     True: export tariff; False: import tariff
   * @returns {object}                  JSON tariff price structure or undefined if no prices available atTime
   */
  async getTariffDirectionPrices(atTime, direction) {
    const tariff = await this.getTariffDirection(direction);
    if (tariff !== undefined) {
      const prices = await this.getPrices(atTime, tariff);
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
  async getNextTariffSlotPrices(slotStart, halfHourly, direction) {
    let nextPrices = undefined;
    if (slotStart !== null) {
      nextPrices = await this.getTariffDirectionPrices(slotStart, direction);
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
  async getTomorrowsPricesPresent(atTime, direction) {
    const nextDay = (this.getLocalDateTime(new Date(atTime))).plus({ days: 1 });
    const nextDayPrices = await this.getTariffDirectionPrices(nextDay.toISO(), direction);
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
    const timeZone = this._driver.homey.clock.getTimezone();
    const dateTime = DateTime.fromJSDate(jsDate).setZone(timeZone);
    return dateTime;
  }

  /**
   * Get the expiry date time of the last slot present in the account overview irrespective of tariff
   * @param   {boolean}       direction   True=Export, False=Import, undefined=both
   * @returns {object - JSON}             ISO date-time string of the expiry of the last slot currently in stored account overview
   */
  async getLastPriceSlotExpiry(direction = undefined) {
    const transform = this.lastPriceSlotTransform(direction);
    const lastExpiry = await jsonata(transform).evaluate(this.accountData);
    return lastExpiry;
  }

  /**
 * Indicate whether a tariff is halfHourly or simple
 * @param 		{boolean} 		direction		True: export; False: import 
 * @returns 	{boolean}									True: halfHourly tariff; False: simple tariff
 */
  async isHalfHourly(direction) {
    const tariff = await this.getTariffDirection(direction);
    const priceSlots = 'unitRates' in tariff;
    return priceSlots;
  }

  /**
   * Return the prices for a tariff for the timeslot immediately preceding the time specified
   * @param   {string}          atTime    ISO format timestamp string
   * @param   {object - JSON}   tariff    Tariff data structure
   * @returns {object - JSON}   {preVatUnitRate, unitRate, preVatStandingCharge, standingCharge, ...}; undefined if no prices available
   */
  async getPrices(atTime, tariff) {
    let prices = undefined;
    const midnight = { hour: 0, minute: 0, second: 0, millisecond: 0 };
    const timeZone = this._driver.homey.clock.getTimezone();
    if ("unitRates" in tariff) {
      const slotPriceTransform = this.slotPriceTransform(atTime);
      prices = await jsonata(slotPriceTransform).evaluate(tariff);
    } else {
      const startTime = DateTime.fromJSDate(new Date(atTime)).setZone(timeZone).set(midnight);
      const endTime = startTime.plus({ days: 1 });
      prices = {
        preVatUnitRate: tariff.preVatUnitRate,
        unitRate: tariff.unitRate,
        preVatStandingCharge: tariff.preVatStandingCharge,
        standingCharge: tariff.standingCharge,
        nextSlotStart: endTime.toISO(),
        thisSlotStart: startTime.toISO(),
        isHalfHourly: false,
        quartile: null
      };
    }
    return prices;
  }

  async getDevice(id) {
    const deviceTransform = `data.devices[id="${id}"]`;
    const device = await jsonata(deviceTransform).evaluate(this.accountData);
    return device;
  }

  translateDeviceStatus(status) {
    let translation = null;
    if (status in this._valid_device_status_translations) {
      translation = this._valid_device_status_translations[status];
    }
    return translation;
  }

  /**
   * Return the jsonata transformation to return the live meter id from the account data
   * @returns {string} jsonata transform
   */
  liveMeterTransform() {
    const transform = `data.account.electricityAgreements.meterPoint  
                  [
                    agreements.tariff.isExport=false
                  ]
                  .meters.smartImportElectricityMeter.deviceId`;
    return transform;
  }

  /**
   * Return the jsonata transformation to obtain tariff detail for a specified direction
   * @param   {boolean} isExport  Direction for the tariff
   * @returns {string}            Jsonata transform string
   */
  tariffTransform(isExport) {
    const transform = `data.account.electricityAgreements.meterPoint.agreements.tariff
                          [
                            isExport=${isExport}
                          ]`;
    return transform;
  }

  /**
   * Return the jsonata transformation to obtain the last recorded slot datetime
   * @param   {string}    index   Indexing specification for the tariffs in the account data
   * @returns {string}            Jsonata transform string
   */
  lastPriceSlotTransform(direction) {
    let index = "";
    if (direction !== undefined) {
      index = `[isExport=${direction}]`;
    }
    const transform = `data.account.electricityAgreements.meterPoint.agreements.tariff${index}.
                $fromMillis(
                  $max(
                    unitRates.$toMillis(
                      validTo
                    )
                  )
                )`;
    return transform;
  }

  /**
   * Return the jsonata transformation to obtain a timed price slot
   * @param   {string}    atTime    DateTime string of the required price slot 
   * @returns {string}              Jsonata transformation string
   */
  slotPriceTransform(atTime) {
    const midnight = { hour: 0, minute: 0, second: 0, millisecond: 0 };
    const timeZone = this._driver.homey.clock.getTimezone();
    const tomorrow = DateTime.fromJSDate(new Date(atTime)).setZone(timeZone).plus({ days: 1 }).set(midnight).toISO();
    const slotPriceTransform = `(
      $targetTimestamp := $toMillis("${atTime}");
      $tomorrow := $toMillis("${tomorrow}");
      $selectedRate := unitRates[$toMillis(validFrom) <= $targetTimestamp and $toMillis(validTo) > $targetTimestamp]; 
      $rates := unitRates[$toMillis(validTo)<=$tomorrow];
      $minPrice := $min($rates.value);
      $quartileStep := ($max($rates.value)-$minPrice) / 4;
      $selectedRate != null ?
      {
        "preVatUnitRate": $selectedRate.preVatValue,
        "unitRate": $selectedRate.value,
        "preVatStandingCharge": preVatStandingCharge,
        "standingCharge": standingCharge,
        "nextSlotStart": $selectedRate.validTo,
        "thisSlotStart": $selectedRate.validFrom,
        "quartile": $min([3,$floor(($selectedRate.value-$minPrice)/$quartileStep)]),
        "isHalfHourly": true
      } : undefined                      
    )`;
    return slotPriceTransform;
  }

  /**
   * Return the GraphQL query string to obtain the Octopus Account Information
   * @returns {string} Stringified JSON representing the query
   */
  accountDataQuery(accountId) {
    const query = {
      query: `query GetAccount($accountNumber: String!) {
        account(accountNumber: $accountNumber) {
          id
          balance
          billingOptions {
            currentBillingPeriodStartDate
          }
          brand
          electricityAgreements(active: true) {
            id
            meterPoint {
              mpan
              meters(includeInactive: false) {
                serialNumber
                smartImportElectricityMeter {
                  deviceId
                }
                smartExportElectricityMeter {
                  deviceId
                }
              }
              agreements(includeInactive: false) {
                validFrom
                validTo
                tariff {
                  ... on StandardTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    unitRate
                    preVatUnitRate
                  }
                  ... on DayNightTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    dayRate
                    preVatDayRate
                    nightRate
                    preVatNightRate
                  }
                  ... on ThreeRateTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    offPeakRate
                    preVatOffPeakRate
                    nightRate
                    preVatNightRate
                    dayRate
                    preVatDayRate
                  }
                  ... on HalfHourlyTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    unitRates {
                      preVatValue
                      validFrom
                      validTo
                      value
                    }
                  }
                  ... on PrepayTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    unitRate
                    preVatUnitRate
                  }
                }
              }
            }
          }
        }
        devices(accountNumber: $accountNumber) {
          id
          name
          deviceType
          status {
            currentState
            current
          }
        }
      }`,
      variables: {
        accountNumber: accountId,
      },
      operationName: "GetAccount",
    }
    return JSON.stringify(query, null, 2);
  }

  /**
   * Test whether the specified API access parameters give access to the Kraken data
   * @param     {string}      accountId     The account reference specified
   * @param     {string}      apiKey        The apiKey for the account 
  */
  async testAccessParameters(accountId, apiKey) {
    const token = await this._dataFetcher.testApiKey(apiKey);
    let accountData = undefined;
    let success = false;
    if (token !== undefined) {
      const accountQuery = this.accountDataQuery(accountId);
      accountData = await this._dataFetcher.runGraphQlQuery(accountQuery, token);
      success = accountData !== undefined;
      if (success) {
        //TODO REMOVE THIS GASH CODE
        accountData.data.devices = [
          {
            id: "00000000-000a-4000-8020-15ffff00d84d",
            name: null,
            status: {
              currentState: "SMART_CONTROL_NOT_AVAILABLE"
            }
          },
          {
            id: "00000000-0009-4000-8020-0000000181f6",
            name: "TEST TEST TEST",
            status: {
              currentState: "SMART_CONTROL_IN_PROGRESS"
            }
          }
        ];
        //TODO END GASH
        this._accountData = accountData;
      }
    }
    return success;
  }

  /**
   * Access the account data using the current access parameters and make the data retrieved current
   * @returns {boolean}           True iff account data retrieved
   */
  async accessAccountGraphQL() {
    this._driver.homey.log("krakenAccountWrapper.accessAccountGraphQL: Starting.");
    const accountQuery = this.accountDataQuery(this.accountId);
    const accountData = await this._dataFetcher.getDataUsingGraphQL(accountQuery, this.accessParameters.apiKey);
    if (accountData !== undefined) {
      //TODO: REMOVE THIS GASH CODE
      accountData.data.devices = [
        {
          id: "00000000-000a-4000-8020-15ffff00d84d",
          name: null,
          status: {
            currentState: "SMART_CONTROL_NOT_AVAILABLE"
          }
        },
        {
          id: "00000000-0009-4000-8020-0000000181f6",
          name: "TEST TEST TEST",
          status: {
            currentState: "SMART_CONTROL_IN_PROGRESS"
          }
        }
      ];
      //TODO: END GASH
      this._accountData = accountData;
      this._driver.homey.log(`krakenAccountWrapper.accessAccountGraphQL: Access success:`);
      return true;
    } else {
      this._accountData = undefined;
      this._driver.homey.log("krakenAccountWrapper.accessAccountGraphQL: Access failed.");
      return false;
    }
  }

  /**
   * Get the product and tariff JSON for all MPAN on the account
   * @returns {object} JSON containing the productId and tariffId
   */
  async getOctopusDeviceDefinitions() {
    this._driver.homey.log("krakenAccountWrapper.getOctopusDeviceDefinitions: Starting");
    const meterId = await this.getLiveMeterId();
    if (meterId === undefined || meterId === null || meterId.length == 0) {
      return [];
    } else {
      const expression = jsonata(this.homeyDevicesTransform());
      const tariffDeviceDefinitions = await expression.evaluate(this.accountData);
      return tariffDeviceDefinitions;
    }
  }

  /**
   * Get the Jsonata transform to abstract product tariff for all MPAN on the account
   * @returns {string} Jsonata query to perform the transform
   */
  homeyDevicesTransform() {
    //let accountNumber = this.accountId;
    const statusCodes = JSON.stringify(Object.getOwnPropertyNames(this._valid_device_status_translations));
    const transform = `
      $append(
        data[].account.electricityAgreements.{
              "name" : $join(
                [
                  meterPoint.agreements.tariff.isExport ? "Export" : "Import",
                  " Tariff"
                ]),
              "data" : {
                "id": $join(
                  [
                    "${this.accountId}",
                    " ",
                    meterPoint.agreements.tariff.isExport ? "Export" : "Import"
                  ])
                },
              "settings" : {
              },
              "store" : {
                "isExport" : meterPoint.agreements.tariff.isExport,
                "octopusClass" : "octopusTariff",
                "isHalfHourly":meterPoint.agreements.tariff.$exists(unitRates)
              },
              "icon" : $join (
                [
                  "/",
                  meterPoint.agreements.tariff.isExport ? "export" : "import",
                  ".svg"
                ]
              )
            }
        ,$append(
          data[]{
            "name": "Octopus Account",
            "data": {
              "id": "${this.accountId} Octopus Account"
            },
            "settings": {},
            "store": {
              "octopusClass": "octopusAccount"
            },
            "icon": "/account.svg"
          },
          data[].devices[status.currentState in ${statusCodes}].{
            "name": (name = null) ? "Unknown Device" : name,
            "data": {
              "id": id
            },
            "store": {
              "octopusClass": "smartDevice",
              "deviceId": id
            },
            "icon": "device.svg"
          }
        )
      )`
    return transform
  }

  /**
   * Return the minimum price for the tariff for the day
   * @param   {string}    atTime    Datetime of the current event
   * @param   {boolean}   isExport  True iff export tariff, false otherwise
   * @returns {float}               The minimum price for the day  
   */
  async minimumDayPrice(atTime, isExport) {
    const tariff = await this.getTariffDirection(isExport);
    //this._driver.homey.log(`krakenAccountWrapper.minimumDayPrice: atTime ${atTime} isExport ${isExport}`);
    //this._driver.homey.log(`krakenAccountWrapper.minimumDayPrice: tariff ${JSON.stringify(tariff)}`);
    let minimumPrice = 0;
    if ('unitRates' in tariff) {
      const dateTime = this.getLocalDateTime(new Date(atTime)).plus({ days: 1 }).set({ hour: 0, minute: 0, second: 0, millisecond: 0 }).toISO();
      const expression = jsonata(`$min(unitRates[$toMillis("${dateTime}")>$toMillis(validFrom)].value)`);
      minimumPrice = await expression.evaluate(tariff);
      //this._driver.homey.log(`krakenAccountWrapper.minimumDayPrice: dateTime ${dateTime} ${minimumPrice}`);
    } else if ('nightRate' in tariff) {
      minimumPrice = tariff.nightRate;
    } else {
      minimumPrice = tariff.dayRate;
    }
    return minimumPrice;
  }

  /**
   * Return live meter data from the instantiated live meter device
   * @returns {object} reading JSON object representing the current data
   */
  async getLiveMeterData() {
    const meterId = await this.getLiveMeterId();
    const deviceIds = await this.getDeviceIds();
    const meterQuery = this.buildDispatchQuery(meterId, deviceIds);
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
      //TODO: REMOVE THIS GASH CODE
      let today = this.getLocalDateTime(new Date()).set({ second: 0, millisecond: 0 });
      let xDispatches = {
        d00000000_0009_4000_8020_0000000181f6: [
          {
            end: today.set({ hour: 12, minute: 50 }).toISO(), //"2025-10-25T12:50:00+00:00",
            energyAddedKwh: -11.618,
            start: today.set({ hour: 12, minute: 36 }).toISO(), //"2025-10-25T12:36:00+00:00",
            type: "SMART"
          },
          {
            end: today.set({ hour: 15, minute: 30 }).toISO(), //"2025-10-25T15:30:00+00:00",
            energyAddedKwh: -11.618,
            start: today.set({ hour: 13, minute: 56 }).toISO(), //"2025-10-25T13:56:00+00:00",
            type: "SMART"
          },
          {
            end: today.set({ hour: 17, minute: 30 }).toISO(), //"2025-10-25T15:30:00+00:00",
            energyAddedKwh: -11.618,
            start: today.set({ hour: 16, minute: 15 }).toISO(), //"2025-10-25T13:56:00+00:00",
            type: "SMART"
          },
          {
            end: today.set({ hour: 19, minute: 0 }).toISO(), //"2025-10-25T17:45:00+00:00",
            energyAddedKwh: -3.417,
            start: today.set({ hour: 18, minute: 15 }).toISO(), //"2025-10-25T19:30:00+00:00",
            type: "SMART"
          },
          {
            end: today.set({ hour: 19, minute: 45 }).toISO(), //"2025-10-25T17:45:00+00:00",
            energyAddedKwh: -3.417,
            start: today.set({ hour: 19, minute: 10 }).toISO(), //"2025-10-25T19:30:00+00:00",
            type: "SMART"
          },
          {
            end: today.plus({ days: 1 }).set({ hour: 6, minute: 0 }).toISO(), //"2025-10-26T06:00:00+00:00",
            energyAddedKwh: -70.3,
            start: today.set({ hour: 20, minute: 0 }).toISO(), //"2025-10-25T20:30:00+00:00",
            type: "SMART"
          }
        ],
        d00000000_000a_4000_8020_15ffff00d84d: null
      };
      response.data["d00000000_0009_4000_8020_0000000181f6"] = xDispatches["d00000000_0009_4000_8020_0000000181f6"];
      //TODO: END GASH
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
  async earliestDispatch(dispatchArray) {
    //this._driver.homey.log(`krakenAccountWrapper.earliestDispatch: ${JSON.stringify(dispatchArray)}`);
    const expression = jsonata(
      `$filter($, function($v, $i, $a) {
          $toMillis($v.start) = $min($a.$toMillis(start))
        }
      )`
    );
    const result = await expression.evaluate(dispatchArray);
    //this._driver.homey.log(`krakenAccountWrapper.earliestDispatch: ${JSON.stringify(result)}`);
    return result;
  }

  futureDispatches(atTime, plannedDispatches) {
    const eventTime = this.getLocalDateTime(new Date(atTime));
    const selectedItems = plannedDispatches.filter((dispatch) => this.advanceTime(dispatch.start) > eventTime);
    //this._driver.homey.log(`krakenAccountWrapper.futureDispatches: selected: ${JSON.stringify(selectedItems)}`);
    return selectedItems;
  }

  currentDispatch(atTime, plannedDispatches) {
    const eventTime = this.getLocalDateTime(new Date(atTime));
    const selectedDispatches = plannedDispatches.filter((dispatch) =>
      (this.advanceTime(dispatch.start) < eventTime) &&
      (this.extendTime(dispatch.end) > eventTime)
    );
    return (selectedDispatches.length == 0) ? undefined : selectedDispatches[0];
  }

  inDispatchToDevice(atTime, dispatch) {
    const eventTime = this.getLocalDateTime(new Date(atTime));
    const startTime = this.getLocalDateTime(new Date(dispatch.start));
    const endTime = this.getLocalDateTime(new Date(dispatch.end));
    this._driver.homey.log(`krakenAccountWrapper.inDispatchToDevice: ${JSON.stringify(dispatch)} ${eventTime.toISO()} ${startTime.toISO()} ${endTime.toISO()}`);
    return (startTime < eventTime) && (endTime > eventTime);
  }

  /**
   * Advance a start time to the preceding 30 minute boundary (00 or 30 minutes past the hour) 
   * @param   {string}      time     String datetime to be advanced, in ISO format
   * @returns {DateTime}             <time> advanced to the preceding 30 minute boundary
   */
  advanceTime(time) {
    const dateTime = this.getLocalDateTime(new Date(time));
    return this.advanceDateTime(dateTime);
  }

  /**
   * Extend an end time to the following 30 minute boundary (00 or 30 minutes past the hour)
   * @param   {string}        time    String datetime to be extend, in ISO format 
   * @returns {DateTime}              <time> extended to the following 30 minute boundary
   */
  extendTime(time) {
    //Advance the time by 30 minutes, then retard the result
    const dateTime = this.getLocalDateTime(new Date(time)).plus({ minutes: 29 });
    return this.advanceDateTime(dateTime);
  }

  /**
   * Retard a dateTime to the nearest preceding 30 minute boundary (00 or 30 minutes past the hour)
   * @param   {DateTime}    dateTime  Datetime to be retarded
   * @returns {DateTime}              Retarded datetime
   */
  advanceDateTime(dateTime) {
    const newMinute = (dateTime.minute < 30) ? 0 : 30;
    const advancedTime = dateTime.set({ minute: newMinute, second: 0, millisecond: 0 });
    return advancedTime;
  }

  /**
   * Build the live data query using the live meter Id and intelligent device Ids
   * @param   {string}      meterId     The id of the live meter (e.g. Octopus Home Mini) 
   * @param   {string[]}    deviceIds   Array of intelligent device Ids   
   * @returns {object}                  JSON result of Graph QL query
   */
  buildDispatchQuery(meterId, deviceIds) {
    const operationName = 'getHighFrequencyData';
    let variableDeclarations = '$meterId: String!';
    let queryDeclarations =
      `smartMeterTelemetry(
        deviceId: $meterId
      ) 
      {
        demand
        export
        consumption
        readAt
      }`;
    let variableValues = {
      meterId: meterId
    };

    for (const deviceNum in deviceIds) {
      const deviceNumLabel = deviceNum.padStart(2, "0");
      const deviceVariableName = `deviceId${deviceNumLabel}`;
      variableDeclarations += `, $${deviceVariableName}: String!`;
      const deviceLabel = this.hashDeviceId(deviceIds[deviceNum]);
      queryDeclarations += `
      ${deviceLabel}: flexPlannedDispatches(deviceId: $${deviceVariableName}) {
        type
        start
        end
        energyAddedKwh
      }`;
      variableValues[deviceVariableName] = deviceIds[deviceNum];
    }

    const gqlQuery = {
      query: `query ${operationName}(${variableDeclarations}){${queryDeclarations}}`,
      variables: variableValues,
      operationName: operationName
    }

    return JSON.stringify(gqlQuery);

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
   * Get the month day number (1-31) on which the charging period commences
   * @returns {integer}       Day number (1-31)
   */
  getBillingPeriodStartDay() {
    const dateString = this.accountData.data.account.billingOptions.currentBillingPeriodStartDate;
    const timeZone = this._driver.homey.clock.getTimezone();
    const date = DateTime.fromISO(dateString, { zone: timeZone, setZone: true }).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    const monthDay = date.minus({ days: 1 }).day;
    return monthDay;
  }

  /**
   * Get the current balance of the account from account data
   * @returns {float}         Balance amount
   */
  getCurrentBalance() {
    //TODO: Consider using JSONata to do this for consistency and robustness
    const pence = this.accountData.data.account.balance;
    return pence * .01;
  }

  /**
   * Indicate that at least 24 hours has passed, or that the end time of the last slot of a half-hourly charged tariff is past.
   * @param {string}  atTime                  The date time of the event in string format
   * @param {string}  refreshDate             The date time of the last refresh in ISO format
   * @returns {boolean}                       True indicates that the data must be refreshed 
   */
  async checkAccountDataRefresh(atTime) {
    let dataRefresh = true;
    if (this._accountData !== undefined) {
      const timeZone = this._driver.homey.clock.getTimezone();
      const eventDateTime = DateTime.fromJSDate(new Date(atTime)).setZone(timeZone);
      dataRefresh = ((eventDateTime.minute == 0) || eventDateTime.minute == 30);
    }
    this._driver.log(`krakenAccountManager.checkAccountDataRefresh: exiting ${dataRefresh}`);
    return dataRefresh;
  }

}