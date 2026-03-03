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
    this._driver = driver;
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
    const wrapper = new krakenAccountWrapper(this.driver);
    let accountData = await wrapper.accessAccountGraphQL(token);

    if (accountData) {
      return await this.executeEventOnDevices(atTime, accountData);
    } else {
      throw new Error('Unable to access account data');
    }
  }

  /**
   * Return the Homey driver instance
   * @returns {krakenDriver} current driver instance
   */
  get driver() {
    return this._driver;
  }

  /**
   * Retrieve the device definitions from the octopus account data
   * @returns {Promise<object - JSON>}   Structure containing the device definitions for Homey
   */
  async getOctopusDeviceDefinitions() {
    const wrapper = new krakenAccountWrapper(this.driver);
    return await wrapper.getOctopusDeviceDefinitions();
  }

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

  /**
   * Loop over devices, executing the event
   * @param   {string}            atTime      string representation of the event time in the form "yyyy-mm-ddTHH:MM:SS±hh:mm" 
   * @param   {object}            accountData kraken account data
   * @returns {promise<boolean>}              Booleans indicating whether any device has been updated by the event
   */
  async executeEventOnDevices(atTime, accountData) {
    let updates = false;
    const wrapper = new krakenAccountWrapper(this.driver);
    const liveMeterId = wrapper.getLiveMeterId(accountData);
    //this.driver.log(`managerEvent.ExecuteEventOnDevices: meterId ${liveMeterId}`);

    const deviceIds = wrapper.getDeviceIds(accountData);
    const meterFetchPromise = wrapper.getLiveMeterData(atTime, liveMeterId, deviceIds);
    const deviceReadyPromises = this.driver.getDevices().map(device => device.ready());

    let [{ reading, dispatches }, ...deviceReadyResults] = await Promise.all([
      meterFetchPromise,
      ...deviceReadyPromises
    ]);

    const availableDevicePromises = this.driver.getDevices().map(device => device.setDeviceAvailability(accountData));
    await Promise.all(availableDevicePromises);

    //this.driver.log(`managerEvent.executeEventOnDevices: Live meter data: ${JSON.stringify(reading)}, ${JSON.stringify(dispatches)}`);

    if ((reading !== undefined) && (dispatches !== undefined)) {
      const deviceOrder = ['smartDevice', 'octopusTariff', 'octopusAccount'];
      for (const device of this.driver.getDevicesOrderedBy(deviceOrder)) {
        if (device.getAvailable()) {
          this.driver.log(`managerEvent.executeEventOnDevices: start event for: ${device.getName()}`);
          device.processEvent(atTime, this.newDay(atTime), reading, dispatches, accountData);
          this.driver.log(`managerEvent.executeEventOnDevices: end event for: ${device.getName()}`);
        }
      }

      accountData = null;
      reading = null;
      dispatches = null;

      this.driver.log(`managerEvent.executeEventOnDevices: start commit capabilities`);
      const allUpdatePromises = this.driver.getDevices().flatMap(device => {
        return device.updateCapabilities();
      });

      // Single synchronization point for the entire app
      const results = await Promise.all(allUpdatePromises);

      // 'updates' will be true if any single promise in the lake returned true
      updates = results.includes(true);
      this.driver.log(`managerEvent.executeEventOnDevices: end commit capabilities`);

      await this.logMemoryToInsights();

    } else {
      this.driver.log(`managerEvent.executeEventOnDevices: unable to retrieve live meter data`);
    }

    return updates;
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
      const v8 = require('v8');
      const heapStats = v8.getHeapStatistics();

      // 1. Reconstruct Footprint from V8-only stats
      // total_heap_size = Memory V8 has currently grabbed from the OS
      // external_memory = Buffers (Kraken strings) living outside the JS heap
      const heapTotal = heapStats.total_heap_size || 0;
      const external = heapStats.external_memory || 0;
      const heapUsed = heapStats.used_heap_size || 0;

      const footprintKB = Math.round(((heapTotal + external) / 1024) * 10) / 10;
      const externalKB = Math.round((external / 1024) * 10) / 10;
      const heapUsedKB = Math.round((heapUsed / 1024) * 10) / 10;

      // 2. Update the High Water Mark
      if (footprintKB > (this.driver.maxPssPeak || 0)) {
        this.driver.maxPssPeak = footprintKB;
      }

      // 3. Log to Insights
      await this.logValue('memory_rss', footprintKB, 'App Footprint (V8 Total)');
      await this.logValue('mem_external', externalKB, 'External/Buffer Memory');
      await this.logValue('mem_rss_peak', this.driver.maxPssPeak, 'Peak Memory Footprint');

      this.driver.log(`managerEvent.logMemoryToInsights: Footprint: ${footprintKB}KB | Heap: ${heapUsedKB}KB | Ext: ${externalKB}KB`);

    } catch (err) {
      this.driver.log('managerEvent.logMemoryToInsights: Error:', err.message);
    }
  }

  /**
   * Ensures the log exists and logs the value
   * @param   {string}  id      The log ID
   * @param   {number}  value   The value to log
   * @param   {string}  title   The log title
   * @returns {Promise<void>}
   */
  async logValue(id, value, title) {
    let log;
    try {
      log = await this.driver.homey.insights.getLog(id);
    } catch (e) {
      log = await this.driver.homey.insights.createLog(id, {
        title: { en: title },
        type: 'number',
        units: 'KB',
        decimals: 1
      });
    }
    return log.createEntry(value);
  }
}