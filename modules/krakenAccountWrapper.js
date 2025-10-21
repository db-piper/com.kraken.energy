'use strict';

const jsonata = require('jsonata');
const dataFetcher = require('./dataFetcher');
const { DateTime } = require('luxon');
const AccountIdName = "krakenAccountId";
const ApiKeyName = "krakenApiKey";

//TODO: Place Jsonata queries in separate functions.

module.exports = class krakenAccountWrapper {
  /**
   * krakenAccountWrapper obtains the account overview data via GQL and then uses jsonata to query the data structure
   * in different ways.
   */

  /**
   * Constructor for krakenAccountWrapper
   * @param {object - driver} driver managing the devices 
   */
  constructor(driver) {
    driver.homey.log(`krakenAccountWrapper.constructor: Instantiating`);
    this._driver = driver;
    this._dataFetcher = new dataFetcher(this._driver);
    this._accountData = undefined;
    //this._accountRefreshDate = undefined;
  }

  /**
   * Persist the parameters that give access to the Kraken account's data
   * @param {string} accountId    Kraken account Id in the form A-9A999999 
   * @param {string} apiKey       Kraken account specific API key 32 alpha numeric characters starting sk_live_...          
   */
  setAccessParameters(accountId, apiKey) {
    const settings = this._driver.homey.settings;
    settings.set(AccountIdName, accountId);
    settings.set(ApiKeyName, apiKey);
  }

  /**
   * Retrieve the parameters that give access to the Kraken account's data
   * @returns {object}    With fields accountId and apiKey
   */
  get accessParameters() {
    const settings = this._driver.homey.settings;
    const keys = settings.getKeys();

    let parameters = {};
    parameters[AccountIdName] = undefined;
    parameters[ApiKeyName] = undefined;

    if (keys.includes(AccountIdName)) {
      parameters.accountId = settings.get(AccountIdName);
    }

    if (keys.includes(ApiKeyName)) {
      parameters.apiKey = settings.get(ApiKeyName);
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

  // get accountLastRefresh() {
  //   return this._accountRefreshDate;
  // }

  async getLiveMeterId() {
    let transform = this.liveMeterTransform();
    return await jsonata(transform).evaluate(this.accountData);
  }

  /**
   * Return the instantiated data fetcher
   * @returns {object} Of class dataFetcher
   */
  //TODO: Remove this property getter when it's no longer needed
  get dataFetcher() {
    return this._dataFetcher;
  }

  /**
   * Return tariff details for the specified direction for the account overview
   * @param   {boolean} isExport    true - export tariff; false - import tariff
   * @returns {string}              JSON structure of the tariff details or undefined
   */
  async getTariffDirection(isExport) {
    const accountOverview = this.accountData;
    const tariffTransform = `data.account.electricityAgreements.meterPoint.agreements.tariff
                          [
                            isExport=${isExport}
                          ]`;
    const tariff = await jsonata(tariffTransform).evaluate(accountOverview);
    return tariff;
  }

  /**
   * Get the expiry date time of the last slot present in the account overview irrespective of tariff
   * @param   {boolean}       direction   True=Export, False=Import, undefined=both
   * @returns {object - JSON}             ISO date-time string of the expiry of the last slot currently in stored account overview
   */
  async getLastPriceSlotExpiry(direction = undefined) {
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
    const lastExpiry = await jsonata(transform).evaluate(this.accountData);
    return lastExpiry;
  }

  /**
   * Return the prices for a tariff for the timeslot immediately preceding the time specified
   * @param   {string}          atTime    ISO format timestamp string
   * @param   {object - JSON}   tariff    Tariff data structure
   * @returns {object - JSON}   {preVatUnitRate, unitRate, preVatStandingCharge, standingCharge, ...} 
   */
  async getPrices(atTime, tariff) {
    let prices = undefined;
    const midnight = { hour: 0, minute: 0, second: 0, millisecond: 0 };
    const timeZone = this._driver.homey.clock.getTimezone();
    if ("unitRates" in tariff) {
      const tomorrow = DateTime.fromJSDate(new Date(atTime)).setZone(timeZone).plus({ days: 1 }).set(midnight);
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
   * Return the GraphQL query string to obtain the Octopus Account Information
   * @returns {string} Stringified JSON representing the query
   */
  accountDataQuery(accountId) {
    //const account = this._dataFetcher.account;
    this._driver.homey.log(`krakenAccountWrapper.accountDataQuery: accountId ${accountId}`);
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
      }`,
      variables: {
        accountNumber: accountId,
      },
      operationName: "GetAccount",
    }
    return JSON.stringify(query, null, 2);
  }

  async testAccessParameters(accountId, apiKey) {
    const token = await this._dataFetcher.testApiKey(apiKey);
    let accountData = undefined;
    let success = false;
    if (token !== undefined) {
      const accountQuery = this.accountDataQuery(accountId);
      accountData = await this._dataFetcher.runGraphQlQuery(accountQuery, token, true);
      success = accountData !== undefined;
      if (success) {
        this._accountData = accountData;
        //this._accountRefreshDate = (new Date()).toISOString();
      }
    }
    return success;
  }

  /**
   * Test whether the API Key gives access to the Account and store the Account data if successful
   * @returns {boolean}           True iff account data retrieved
   */
  async accessAccountGraphQL() {
    this._driver.homey.log("krakenAccountWrapper.accessAccountGraphQL: Starting.");
    const accountQuery = this.accountDataQuery(this.accountId);
    const accountData = await this.dataFetcher.getDataUsingGraphQL(accountQuery, this.accessParameters.apiKey);
    if (accountData !== undefined) {
      this.dataFetcher.accountOverview = accountData;
      this._accountData = accountData;
      //this.dataFetcher.homey.settings.set("accountOverview", accountData);
      //this._accountRefreshDate = (new Date()).toISOString();
      //this.dataFetcher.accountOverviewRefresh = (new Date()).toISOString();
      //this.dataFetcher.homey.settings.set("accountOverviewRefresh",(new Date()).toISOString());
      this._driver.homey.log(`krakenAccountWrapper.accessAccountGraphQL: Access success:`);
      return true;
    } else {
      this._driver.homey.log("krakenAccountWrapper.accessAccountGraphQL: Access failed.");
      this._accountData = undefined;
      //this._accountRefreshDate = undefined;
      return false;
    }
  }

  /**
   * Get the product and tariff JSON for all MPAN on the account
   * @returns {object} JSON containing the productId and tariffId
   */
  async getOctopusDeviceDefinitions() {
    this._driver.homey.log("krakenAccountWrapper.getOctopusDeviceDefinitions: Starting");
    const expression = jsonata(this.mpanProductTariffsTransform());
    this._driver.homey.log(`Account data ID: ${this.accountData.data.account.id}`);
    const deviceDefinitions = await expression.evaluate(this.accountData);
    const octopusMini = {
      name: "Octopus Mini",
      data: {
        id: `${this.accountId} Octopus Mini`
      },
      settings: {},
      store: {
        octopusClass: "octopusMini"
      },
      icon: "/meter.svg"
    };
    const octopusAccount = {
      name: "Octopus Account",
      data: {
        id: `${this.accountId} Octopus Account`
      },
      settings: {},
      store: {
        octopusClass: "octopusAccount"
      },
      icon: "/account.svg"
    };
    //deviceDefinitions.push(octopusMini, octopusAccount);
    deviceDefinitions.push(octopusAccount);
    return deviceDefinitions;
  }

  /**
   * Get the Jsonata transform to abstract product tariff for all MPAN on the account
   * @returns {string} Jsonata query to perform the transform
   */
  mpanProductTariffsTransform() {
    let accountNumber = this._dataFetcher.account;
    let transform = `data[].account.electricityAgreements.{
        "name" : $join(
          [
            meterPoint.agreements.tariff.isExport ? "Export" : "Import",
            " Tariff"
          ]),
        "data" : {
          "id": $join(
            [
              "${accountNumber}",
              " ",
              meterPoint.agreements.tariff.isExport ? "Export" : "Import"
            ])
          },
        "settings" : {
        },
        "store" : {
          "isExport" : meterPoint.agreements.tariff.isExport,
          "octopusClass" : "octopusTariff"
        },
        "icon" : $join (
          [
            "/",
            meterPoint.agreements.tariff.isExport ? "export" : "import",
            ".svg"
          ]
        )
      }`
    return transform
  }

  //TODO: Sometimes the GQL returns an empty object at data.data.smartMeterTelemetry - retry?
  /**
   * Return live meter data from the instantiated live meter device
   * @returns {object} reading JSON object representing the current data
   */
  async getLiveMeterData() {
    const meter_query = await this.liveMeterDataQuery();
    this._driver.log
    let data = await this.dataFetcher.getDataUsingGraphQL(meter_query, this.accessParameters.apiKey);
    if ((data !== undefined) && ("data" in data)) {
      let reading = data.data.smartMeterTelemetry[0];
      return reading;
    } else {
      return undefined;
    }
  }

  /**
   * Return the query string to obtain current data from Octopus Mini Live Meter
   * @returns {string} Stringified JSON representing the query
   */
  async liveMeterDataQuery() {
    let meterId = await this.getLiveMeterId();
    let query = {
      query: `query GetOctopusMiniReading(
          $meterID: String!
        ) 
        {
          smartMeterTelemetry(
            deviceId: $meterID
          ) 
          {
            demand
            export
            consumption
            readAt
          }
        }`,
      variables: {
        meterID: meterId,
      },
      operationName: "GetOctopusMiniReading",
    }
    return JSON.stringify(query, null, 2);
  }

  async getBillingPeriodStartDay() {
    //TODO: Consider using JSONata to do this for consistency and robustness
    const dateString = this.accountData.data.account.billingOptions.currentBillingPeriodStartDate;
    //TODO: Make this robust for TZ using the TZ data
    const date = DateTime.fromJSDate(new Date(dateString + "T00:00:00Z"));
    const monthDay = date.minus({ days: 1 }).day;
    this._driver.homey.log(`krakenAccountWrapper.getBillingPeriodStartDay: monthDay: ${monthDay}`);
    return monthDay;
  }

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
    this._driver.log(`krakenAccountWrapper.checkAccountDataCurrent: starting`);
    let dataRefresh = true;
    if (this._accountData !== undefined) {
      const timeZone = this._driver.homey.clock.getTimezone();
      const eventDateTime = DateTime.fromJSDate(new Date(atTime)).setZone(timeZone);
      const onTheHour = 0 == eventDateTime.minute;
      const lateEnough = 9 <= eventDateTime.hour;
      const lastPriceSlotExpiry = await this.getLastPriceSlotExpiry();
      const lastPriceSlotExpiryDate = DateTime.fromJSDate(new Date(lastPriceSlotExpiry)).setZone(timeZone);
      const pricesAlreadyAvailable = lastPriceSlotExpiryDate.day != eventDateTime.day;
      this._driver.log(`krakenAccountWrapper.checkAccountDataCurrent: Minute ${eventDateTime.minute} hour ${eventDateTime.hour}`);
      this._driver.log(`krakenAccountWrapper.checkAccountDataCurrent: onTheHour ${onTheHour} lateEnough ${lateEnough} pricesAvail ${pricesAlreadyAvailable}`);
      dataRefresh = onTheHour && lateEnough && !pricesAlreadyAvailable;
    }
    this._driver.log(`krakenAccountManager.checkAccountDataCurrent: exiting ${dataRefresh}`);
    return dataRefresh;
  }

}