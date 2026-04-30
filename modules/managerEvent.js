'use strict';

const krakenAccountWrapper = require("./krakenAccountWrapper");
const dayjs = require('../bundles/dayjs-bundled/index.js');

module.exports = class managerEvent {
  /**
   * Establish the event interval and manage the execution of events by devices
   * @param {krakenDriver} driver controlling the devices
   */
  constructor(driver) {
    driver.homey.log(`managerEvent.constructor: Instantiating`);
    this._driver = driver;
    this._targetSecond = 15;
  }

  /**
   * Execute a timed event.
   */
  async executeEvent() {
    const atTimeMillis = dayjs().tz(this.wrapper.timeZone).valueOf();
    const lastEventTime = this.driver.homey.app.eventTime;
    const periodChanges = this.wrapper.checkTimeBoundaries(atTimeMillis, lastEventTime);
    const fullEvent = this.driver.homey.app.fullEvent;
    this.driver.log(`managerEvent.executeEvent: Period changes: ${JSON.stringify(periodChanges)}`);
    let result = false;
    let account, importTariff, exportTariff, devices, liveMeterId, deviceIds, futurePrices;

    if (periodChanges.chunk || periodChanges.tariffSlotImport || periodChanges.tariffSlotExport || !this.driver.homey.app.importTariff || fullEvent) {
      this.driver.log(`managerEvent.executeEvent: Chunk changed or first run`);
      ({ account, importTariff, exportTariff, devices, futurePrices } = await this.wrapper.accessAccountGraphQL(atTimeMillis));
      if (account) {
        liveMeterId = account.liveMeterId;
        deviceIds = Object.values(devices).map(device => device.id);
        this.driver.homey.app.importTariff = importTariff;
        this.driver.homey.app.exportTariff = exportTariff;
        this.driver.homey.app.liveMeterId = liveMeterId;
        this.driver.homey.app.deviceIds = deviceIds;
        this.driver.homey.app.fullEvent = false;
        await this.evaluateTriggerFlowCards(futurePrices);
      } else {
        throw new Error('Unable to access account data');
      }
    } else {
      this.driver.log(`managerEvent.executeEvent: Chunk unchanged`);
      importTariff = this.driver.homey.app.importTariff;
      exportTariff = this.driver.homey.app.exportTariff;
      liveMeterId = this.driver.homey.app.liveMeterId;
      deviceIds = this.driver.homey.app.deviceIds;
    }

    result = await this.executeEventOnDevices(atTimeMillis, periodChanges, deviceIds, liveMeterId, account, importTariff, exportTariff, devices);
    this.driver.homey.app.eventTime = atTimeMillis;
    await this.logMemoryToInsights()
    return result;
  }

  async evaluateTriggerFlowCards(futurePrices) {
    const flowCardDef = this.driver.homey.flow.getTriggerCard('cheapestBlockStrategy');
    this.driver.log(`managerEvent.evaluateTriggerFlowCards: flowCardDef id ${flowCardDef.id}`);
    this.driver.log(`managerEvent.evaluateTriggerFlowCards: flowCard Properties ${JSON.stringify(Object.getOwnPropertyNames(flowCardDef))}`);
    const args = await flowCardDef.getArgumentValues();
    this.driver.log(`managerEvent.evaluateTriggerFlowCards: args ${JSON.stringify(args)}`);
    if (args.length > 0) {
      const executedCards = this.driver.homey.app.triggerFlowCardState;
      this.driver.log(`managerEvent.evaluateTriggerFlowCards: executedCards ${JSON.stringify(executedCards)}`);
      const unfulfilled = args.filter((item) => !executedCards[this.hashFlowCardArgs(item)]);
      if (unfulfilled.length > 0) {
        const pendingIds = unfulfilled.map(cardArgs => this.hashFlowCardArgs(cardArgs));
        this.driver.log(`managerEvent.evaluateTriggerFlowCards: pendingIds ${JSON.stringify(pendingIds)}`);
        flowCardDef.trigger({}, { prices: futurePrices, pendingIds: pendingIds });
      }
    }
  }

  hashFlowCardArgs(flowCardArgs) {
    return `${flowCardArgs.duration}_${flowCardArgs.start}_${flowCardArgs.end}_${flowCardArgs.strategy}_${flowCardArgs.label}`
  }

  /**
   * Return the Homey driver instance
   * @returns {krakenDriver} current driver instance
   */
  get driver() {
    return this._driver;
  }

  /**
   * Return an instance of krakenAccountWrapper
   * @returns {krakenAccountWrapper}  Instance of krakenAccountWrapper
   */
  get wrapper() {
    return this.driver.wrapper;
  }

  /**
   * Return the target second for the event
   * @returns {number}  Target second for the event
   */
  get targetSecond() {
    return this._targetSecond
  }

  /**
   * Retrieve the device definitions from the octopus account data
   * @returns {Promise<object - JSON>}   Structure containing the device definitions for Homey
   */
  async getOctopusDeviceDefinitions() {
    return await this.wrapper.getOctopusDeviceDefinitions();
  }

  /**
   * Get a valid GQL token using the specified key or a key stored in app settings
   * @param     {string | null} userSpecifiedKey    Candidate key specified through the user interface
   * @returns   {Promise<string>}                   Valid GQL token
   */
  async getApiToken(userSpecifiedKey = null) {
    return await this.wrapper.getApiToken(userSpecifiedKey);
  }

  /**
   * Proves an Account ID can be accessed by the token derived from the API key and persists it.
   * @param   {string} accountId The ID to validate and store.
   * @param   {string} token     The valid JWT to use for the check.
   * @returns {Promise<boolean>}
   */
  async setValidAccount(account, token) {
    return await this.wrapper.setValidAccount(account, token);
  }

  /**
   * Loop over devices, executing the event
   * @param   {number}            atTimeMillis  event time in milliseconds since the epoch
   * @param   {object}            periodChanges indicates changes in specific timing periods
   * @param   {string[]}          deviceIds     array of device ids
   * @param   {string}            liveMeterId   live meter id
   * @param   {object}            account       kraken account header data
   * @param   {object}            importTariff  kraken import tariff data
   * @param   {object}            exportTariff  kraken export tariff data
   * @param   {object}            devices       kraken device data
   * @returns {promise<boolean>}                True iff any device has been updated by the event
   */
  async executeEventOnDevices(atTimeMillis, periodChanges, deviceIds, liveMeterId, account = undefined, importTariff = undefined, exportTariff = undefined, devices = undefined) {
    let updates = false;
    this.driver.homey.log(`managerEvent.executeEventOnDevices: liveMeterId ${liveMeterId}`);
    const meterFetchPromise = this.wrapper.getLiveMeterData(atTimeMillis, liveMeterId, deviceIds);
    const homeyDeviceReadyPromises = this.driver.getDevices().map(device => device.ready());

    let [{ reading, dispatches, deviceStates }] = await Promise.all([
      meterFetchPromise,
      ...homeyDeviceReadyPromises
    ]);
    const availableDevicePromises = this.driver.getDevices().map(device => device.setDeviceAvailability(deviceIds));
    await Promise.all(availableDevicePromises);

    if ((reading !== undefined) && (dispatches !== undefined)) {
      for (const device of this.driver.getDevices()) {
        if (device.getAvailable()) {
          this.driver.log(`managerEvent.executeEventOnDevices: start event for: ${device.getName()}`);
          device.processEvent(atTimeMillis, periodChanges, reading, dispatches, account, importTariff, exportTariff, devices, deviceStates);
          this.driver.log(`managerEvent.executeEventOnDevices: end event for: ${device.getName()}`);
        }
      }

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

    } else {
      this.driver.log(`managerEvent.executeEventOnDevices: unable to retrieve live meter data`);
    }

    return updates;
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
    } catch {
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