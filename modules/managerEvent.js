'use strict';

const krakenAccountWrapper = require("./krakenAccountWrapper");
const { DateTime } = require('../bundles/luxon');

module.exports = class managerEvent {
  /**
   * Establish the event interval and manage the execution of events by devices
   * @param {krakenDriver} driver controlling the devices
   */
  constructor(driver) {
    driver.homey.log(`managerEvent.constructor: Instantiating`);
    this._accountWrapper = new krakenAccountWrapper(driver);
    this._driver = driver;
    //this._interval = undefined;
    this._period = 60000;  //FREQ
    this._targetSecond = 15;
  }

  /**
   * Start the Metronome.
   * @param {object} homey - Homey instance
   * @param {number} period - Milliseconds
   * @param {function} task - The function to run (Driver.onHeartbeat)
   * @param {function} onIdChanged - Callback for the Interval ID handover
   */
  setInterval(homey, period, task, onIdChanged) {
    this._period = period;
    const delay = (this._targetSecond - new Date().getSeconds() + 60) % 60 || 60;

    return homey.setTimeout(async () => {
      await task(); // Run immediately at target second

      const intervalId = homey.setInterval(async () => {
        await task();
      }, period);

      if (typeof onIdChanged === 'function') {
        onIdChanged(intervalId);
      }
    }, delay * 1000);
  }

  /**
   * Execute a timed event.
   * @param {string} token - Valid JWT token from the App/Airlock
   */
  async executeEvent(token) {
    const atTime = new Date().toISOString();
    this.driver.log(`managerEvent.executeEvent: Fetching GQL data`);

    // Pass the token into your wrapper
    let accountData = await this._accountWrapper.accessAccountGraphQL(token);

    if (accountData) {
      return await this.executeEventOnDevices(atTime, accountData);
    } else {
      throw new Error('Unable to access account data');
    }
  }

  /**
   * Return the krakenAccountWrapper instance
   * @returns   {krakenAccountWrapper}    Account wrapper instance
   */
  get accountWrapper() {
    return this._accountWrapper;
  }

  /**
   * Return the Homey driver instance
   * @returns {krakenDriver} current driver instance
   */
  get driver() {
    return this._driver;
  }

  // /**
  //  * Persist the parameters that give access to the Kraken account's data
  //  * @param {string} accountId    Kraken account Id in the form A-9A999999 
  //  * @param {string} apiKey       Kraken account specific API key 32 alpha numeric characters starting sk_live_...          
  //  */
  // setAccessParameters(accountId, apiKey) {
  //   this._accountWrapper.setAccessParameters(accountId, apiKey);
  // }

  // /**
  //  * Retrieve the parameters that give access to the Kraken account's data
  //  * @returns {object}    With fields accountId and apiKey
  //  */
  // getAccessParameters() {
  //   return this._accountWrapper.accessParameters;
  // }

  /**
   * Retrieve the device definitions from the octopus account data
   * @returns {object - JSON}   Structure containing the device definitions for Homey
   */
  async getOctopusDeviceDefinitions() {
    return await this._accountWrapper.getOctopusDeviceDefinitions();
  }

  // /**
  //  * Test the specified access parameters to ensure they give access to the account data
  //  * @param   {string}  accountId The account ID to be tested in the form A-9A999999 
  //  * @param   {string}  apiKey    The account specific API key 32 alpha numeric characters starting sk_live_...
  //  * @returns {Promise<boolean>}  True iff account data retrieved
  //  */
  // async testAccessParameters(accountId, apiKey) {
  //   const success = await this._accountWrapper.testAccessParameters(accountId, apiKey);
  //   return success;
  // }

  /**
   * homey.SetInterval callback function get data from Kraken and update devices from data
   */
  async processIntervalCallback() {
    const dateTimeNow = new Date();
    this.driver.log(`managerEvent.processIntervalCallback: start: ${dateTimeNow.toISOString()}:`);
    try {
      if (this.driver.getDevices().length > 0) {
        await this.executeEvent(dateTimeNow.toISOString());
      } else {
        this.driver.log(`managerEvent.processIntervalCallback: No devices found. Stopping event loop.`);
        this.unSetInterval();
      }
    } catch (error) {
      this.driver.error(`managerEvent.processIntervalCallback: Error. Terminating loop.`)
      this.unSetInterval();
      throw error;
    }
    this.driver.log(`managerEvent.processIntervalCallback: end:`);
  }

  /**
   * Indicate that, given the event interval specified, the event is the first of the day
   * @param     {string}  atTime  event time string in ISO format 
   * @returns   {boolean}         less than interval milliseconds have passed since midnight
   */
  newDay(atTime) {
    const timeZone = this.driver.homey.clock.getTimezone();
    const eventDateTime = DateTime.fromJSDate(new Date(atTime)).setZone(timeZone);
    const midnight = eventDateTime.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    const elapsed = eventDateTime.diff(midnight, 'milliseconds');
    const isNewDay = elapsed.toMillis() < this._period;
    return isNewDay
  }

  // /**
  //  * Execute a timed event for the specified time
  //  * @param   {string}              atTime  string representation of the event time in the form "yyyy-mm-ddTHH:MM:SS±hh:mm"
  //  */
  // async executeEvent(atTime) {
  //   let updates = []
  //   this.driver.log(`managerEvent.executeEvent: Trying account access`);
  //   let accountData = await this._accountWrapper.accessAccountGraphQL();
  //   this.driver.log(`managerEvent.executeEvent: Account access outcome ${!!(accountData)}`);
  //   if (accountData) {
  //     updates = await this.executeEventOnDevices(atTime, accountData);
  //   } else {
  //     throw new Error('managerEvent.executeEvent: Unable to access account data');
  //   }
  //   return updates;
  // }

  /**
   * Loop over devices, executing the event
   * @param {string}            atTime      string representation of the event time in the form "yyyy-mm-ddTHH:MM:SS±hh:mm" 
   * @param   {object}            accountData kraken account data
   * @returns {promise<boolean[]>}          Booleans indicating for each device whether it has been updated by the event
   */
  async executeEventOnDevices(atTime, accountData) {
    let updates = [];
    const liveMeterId = this._accountWrapper.getLiveMeterId(accountData);
    this.driver.log(`managerEvent.ExecuteEventOnDevices: meterId ${liveMeterId}`);

    const meterFetchPromise = this._accountWrapper.getLiveMeterData(atTime, liveMeterId, accountData);
    const deviceReadyPromises = this.driver.getDevices().map(device => device.ready());

    let [{ reading, dispatches }, ...deviceReadyResults] = await Promise.all([
      meterFetchPromise,
      ...deviceReadyPromises
    ]);

    const availableDevicePromises = this.driver.getDevices().map(device => device.setDeviceAvailability(accountData));
    await Promise.all(availableDevicePromises);

    this.driver.log(`managerEvent.executeEvent: Live meter data: ${JSON.stringify(reading)}, ${JSON.stringify(dispatches)}`);

    if ((reading !== undefined) && (dispatches !== undefined)) {
      const deviceOrder = ['smartDevice', 'octopusTariff', 'octopusAccount'];
      for (const device of this.driver.getDevicesOrderedBy(deviceOrder)) {
        if (device.getAvailable()) {
          this.driver.log(`managerEvent.executeEvent: process event for: ${device.getName()}`);
          device.processEvent(atTime, this.newDay(atTime), reading, dispatches, accountData);
        }
      }

      accountData = null;
      reading = null;
      dispatches = null;

      const deviceCommitPromises = this.driver.getDevices().map(device => device.commitCapabilities());
      updates = await Promise.all(deviceCommitPromises);

      await this.logMemoryToInsights();

    } else {
      this.driver.log(`managerEvent.executeEvent: unable to retrieve live meter data`);
    }

    return updates

  }

  /**
   * Indicate that the day has changed between two timestamps in extended ISO format
   * @param   {string}  laterTime     The new timestamp
   * @param   {string}  earlierTime   The old timestamp
   * @returns {boolean}               True when the day has changed
   */
  changeOfDay(laterTime, earlierTime) {
    const timeZone = this.driver.homey.clock.getTimezone();
    const newDay = DateTime.fromJSDate(new Date(laterTime)).setZone(timeZone).day;
    const oldDay = DateTime.fromJSDate(new Date(earlierTime)).setZone(timeZone).day;
    return newDay != oldDay;
  }

  async logMemoryToInsights() {
    try {
      // Talk directly to the JS engine to avoid the uv_resident_set_memory error
      const heapStats = require('v8').getHeapStatistics();
      const memoryKB = heapStats.used_heap_size / 1024;

      let myLog;
      try {
        myLog = await this.driver.homey.insights.getLog('memory_rss');
      } catch (e) {
        myLog = await this.driver.homey.insights.createLog('memory_rss', {
          title: { en: 'App Memory Usage' },
          type: 'number',
          units: 'KB',
          decimals: 1
        });
      }

      await myLog.createEntry(memoryKB);
      this.driver.homey.log(`[Insight] Recorded: ${memoryKB.toFixed(1)} KB`);
    } catch (err) {
      if (this.driver && this.driver.homey) {
        this.driver.homey.error('[Insight Error]', err.message);
      }
    }
  }
}