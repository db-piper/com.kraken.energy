'use strict';

//const dataFetcher = require("./dataFetcher");
const accountWrapper = require("./krakenAccountWrapper");
const { DateTime } = require("luxon");

module.exports = class managerEvent {
  /**
   * Establish the event interval and manage the execution even
   * @param {Homey.Driver} driver controlling the devices
   */
  constructor(driver) {
    driver.homey.log(`managerEvent.constructor: creating managerEvent`);
    this._driver = driver;
    this._accountWrapper = new accountWrapper(this._driver);
    this._interval = undefined;
    this._period = undefined;
  }

  /**
   * Create the setInterval callback
   * @param {integer} period  Timing interval in milliseconds 
   */
  setInterval(period) {
    if (this._interval === undefined) {
      this._period = period;
      this.driver.log(`managerEvent.setInterval: setting period: ${period}`);
      this._interval = this.driver.homey.setInterval(async () => {
        await this.processIntervalCallback();
      }, period);
    }
  }

  get accountWrapper() {
    return this._accountWrapper;
  }

  /**
   * Persist the parameters that give access to the Kraken account's data
   * @param {string} accountId    Kraken account Id in the form A-9A999999 
   * @param {string} apiKey       Kraken account specific API key 32 alpha numeric characters starting sk_live_...          
   */
  setAccessParameters(accountId, apiKey) {
    this._accountWrapper.setAccessParameters(accountId, apiKey);
  }

  /**
   * Retrieve the parameters that give access to the Kraken account's data
   * @returns {object}    With fields accountId and apiKey
   */
  getAccessParameters() {
    return this._accountWrapper.accessParameters();
  }

  /**
   * Retrieve the device definitions from the octopus account data
   * @returns {object - JSON}   Structure containing the device definitions for Homey
   */
  async getOctopusDeviceDefinitions() {
    return await this._accountWrapper.getOctopusDeviceDefinitions();
  }

  /**
   * Test the specified access parameters to ensure they give access to the account data
   * @param {string} accountId  The account ID to be tested in the form A-9A999999 
   * @param {string} apiKey     The account specific API key 32 alpha numeric characters starting sk_live_...
   * @returns {boolean}
   */
  async testAccessParameters(accountId, apiKey) {
    const success = await this._accountWrapper.testAccessParameters(accountId, apiKey);
    return success;
  }

  /**
   * Destroy the setInterval callback
   */
  unSetInterval() {
    this.driver.log(`managerEvent.unSetInterval: clearing the interval.`);
    this.driver.clearInterval(this._interval);
  }

  /**
   * homey.SetInterval callback function get data from Kraken and update devices
   */
  async processIntervalCallback() {
    const dateTimeNow = new Date();
    this.driver.log(`managerEvent.processIntervalCallback: start: ${dateTimeNow.toISOString()}:`);
    if (this.driver.getDevices().length > 0) {
      await this.executeEvent(dateTimeNow.toISOString());
    }
    this.driver.log(`managerEvent.processIntervalCallback: end:`);
  }

  /**
   * Get the current homeyApp instance
   * @returns {object - homeyApp} current app instance
   */
  get driver() {
    return this._driver;
  }

  /**
   * Indicate that, given the event interval specified, the event is the first of the day
   * @param     {string}  atTime  event time string in ISO format 
   * @returns   {boolean}         less than interval milliseconds have passed since midnight
   */
  newDay(atTime) {
    const timeZone = this.driver.homey.clock.getTimezone();
    const eventDateTime = DateTime.fromJSDate(new Date(atTime)).setZone(timeZone);
    const midnight = eventDateTime.set({hour: 0, minute: 0, second: 0, millisecond: 0});
    const elapsed = eventDateTime.diff(midnight, 'milliseconds');
    const isNewDay = elapsed.toMillis() < this._period;
    this.driver.log(`managerEvent.newDay: event ${eventDateTime.toISO()} midnight ${midnight.toISO()} elapsed ${elapsed.toMillis()} newDay ${isNewDay}`);
    return isNewDay
  }

  /**
   * Execute a timed event for the specified time
   * @param   {string} atTime string representation of the event time in the form "yyyy-mm-ddTHH:MM:SS±hh:mm"
   * @returns {array}         Booleans indicating for each device whether it has been updated by the event
   */
  async executeEvent(atTime) {

    //TODO: Remove processing of the refreshDate here and in krakenAccountWrapper.
    //TODO: Adjust signature of checkAccountDataCurrent to elide refreshDate
    //const refreshDate = this._accountWrapper.accountLastRefresh;
    //BUG:  refresh is NOT newDay - executeEvent requires newDay as second parameter
    const refresh = await this.checkAccountDataRefresh(atTime);
    let readyToProcess = true;

    if (refresh) {
      this.driver.log(`managerEvent.executeEvent: Trying account access`);
      readyToProcess = (await this._accountWrapper.accessAccountGraphQL());
      this.driver.log(`managerEvent.executeEvent: Account access outcome ${readyToProcess}`);
    }

    let updates = new Array();
    if (readyToProcess) {
      const liveReading = await this._accountWrapper.getLiveMeterData();
      for (const device of this.driver.getDevices()) {
        this.driver.log(`managerEvent.executeEvent: process event for: ${device.getName()}`)
        updates.push(await device.processEvent(atTime, this.newDay(atTime), liveReading));
        //updates.push(false);
      }
    }

    return updates;
  }

  /**
   * Indicate that at least 24 hours has passed, or that the end time of the last slot of a half-hourly charged tariff is past.
   * @param {string}  atTime                  The date time of the event in string format
   * @param {string}  refreshDate             The date time of the last refresh in ISO format
   * @returns {boolean}                       True indicates that the data must be refreshed 
   */
  async checkAccountDataRefresh(atTime) {
    this.driver.log(`managerEvent.checkAccountDataCurrent: starting`);
    let dataRefresh = true;
    if (this.accountWrapper.accountData !== undefined) {
      const timeZone = this.driver.homey.clock.getTimezone();
      const eventDateTime = DateTime.fromJSDate(new Date(atTime)).setZone(timeZone);
      const onTheHour = 0 == eventDateTime.minute;
      const lateEnough = 10 <= eventDateTime.hour;
      const lastPriceSlotExpiry = await this._accountWrapper.getLastPriceSlotExpiry();
      const lastPriceSlotExpiryDate = DateTime.fromJSDate(new Date(lastPriceSlotExpiry)).setZone(timeZone);
      const pricesAlreadyAvailable = lastPriceSlotExpiryDate.day != eventDateTime.day;
      dataRefresh = onTheHour && lateEnough && !pricesAlreadyAvailable;
    }
    this.driver.log(`managerEvent.checkAccountDataCurrent: exiting ${dataRefresh}`);
    return dataRefresh;
  }

  /**
   * Indicate that the day has chnaged between two timestamps in extended ISO format
   * @param   {string}  laterTime     The new timestamp
   * @param   {string}  earlierTime   The old timestamp
   * @returns {boolean}               True when the day has changed
   */
  changeOfDay(laterTime, earlierTime) {
    //BUG: Using the JS Date class does not work because Homey always works in UTC. Reimplemented with Luxon
    // const newDate = (new Date(laterTime)).getDate();
    // const oldDate = (new Date(earlierTime)).getDate();
    // return newDate != oldDate;
    const timeZone = this.driver.homey.clock.getTimezone();
    const newDay = DateTime.fromJSDate(new Date(laterTime)).setZone(timeZone).day;
    const oldDay = DateTime.fromJSDate(new Date(earlierTime)).setZone(timeZone).day;
    return newDay != oldDay;
  }

}