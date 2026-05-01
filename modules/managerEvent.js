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
        await this.evaluateTriggerFlowCards(futurePrices, atTimeMillis);
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

  async evaluateTriggerFlowCards(futurePrices, atTimeMillis) {
    const flowCardDef = this.driver.homey.flow.getTriggerCard('cheapestBlockStrategy');
    this.driver.log(`managerEvent.evaluateTriggerFlowCards: flowCardDef id ${flowCardDef.id}`);
    const args = await flowCardDef.getArgumentValues();
    this.driver.log(`managerEvent.evaluateTriggerFlowCards: args ${JSON.stringify(args)}`);
    if (args.length > 0) {
      const executedCards = this.driver.homey.app.triggerFlowCardState;
      this.driver.log(`managerEvent.evaluateTriggerFlowCards: executedCards ${JSON.stringify(executedCards)}`);
      const unfulfilled = args.filter((item) => !executedCards[this.hashFlowCardArgs(item)]);
      if (unfulfilled.length > 0) {
        unfulfilled.forEach(item => {
          const hash = this.hashFlowCardArgs(item);
          const tokens = {
            'duration': item.duration,
            'startTime': item.startTime,
            'endTime': item.endTime,
            'strategy': item.strategy,
            'identifier': item.identifier,
          };

          const state = {
            eventTime: atTimeMillis,
            prices: futurePrices,
            targetId: hash
          };

          this.driver.log(`[managerEvent.evaluateTriggerFlowCards] Triggering flow for: ${hash}`);

          flowCardDef.trigger(tokens, state)
            .catch(err => this.driver.error(`Trigger Error: ${err}`));
        });
      }
    }
  }

  hashFlowCardArgs(flowCardArgs) {
    return `${flowCardArgs.duration}_${flowCardArgs.startTime}_${flowCardArgs.endTime}_${flowCardArgs.strategy}_${flowCardArgs.identifier}`
  }

  async evaluateCheapestBlockStrategyCard(args, state) {
    this.driver.log(`managerEvent.evaluateCheapestBlockStrategyCard: Starting Card Args: ${JSON.stringify(args)}`);
    const thisId = this.hashFlowCardArgs(args);
    // This is not the right card, bail out
    if (thisId !== state.targetId) return false;

    const prices = state.prices;
    const atTimeMillis = state.eventTime;
    const eventTime = dayjs(atTimeMillis).tz(this.wrapper.timeZone).second(0).millisecond(0); //when called will be hh:00:00.000 or hh:30:00.000

    // Missed the boat for this chunk, probably a restart
    if (0 != eventTime.minute() % 30) return false;

    const sHhMm = args.startTime.split(":");
    const startTime = eventTime.hour(Number(sHhMm[0])).minute(Number(sHhMm[1])).second(0).millisecond(0);
    const eHhMm = args.endTime.split(":");
    const endTime = startTime.hour(Number(eHhMm[0])).minute(Number(eHhMm[1]));

    // Not in the window, so can't start yet
    if (eventTime.isBefore(startTime) || eventTime.isAfter(endTime)) return false;
    //Pick out the relevant set of prices from startTime to endTime
    //  startBlock is always [0] otherwise we are outside the window
    //  endBlock is (endTime - startTime)/1800000 [epoch milliseconds]
    const endBlock = Math.floor((endTime.valueOf() - startTime.valueOf()) / 1800000);
    const relevantPrices = prices.slice(0, endBlock);

    //Evaluate the 1 kWh cost for each <duration> block - use the apertureMap function with +/
    //  block length is <duration> * 2  (accounting for the 30 minute resolution of prices)
    const blockLength = Number(args.duration) * 2;
    const blockPrices = this.apertureMap(relevantPrices, blockLength, (window) => window.reduce((total, value) => total + value, 0));
    //Pick out all the equally cheapest blocks - use the targetIndices function with Math.min (could be 2, 4, 5)
    const solutionIndices = this.targetIndices(blockPrices, Math.min(blockPrices));
    //Select the block according to the strategy - earliest = [0], latest = [length(cheapestBlocks) - 1], random = 1/length(cheapestBlocks)
    const randomIndex = Math.min((solutionIndices.length) - 1, Math.floor(Math.random() * solutionIndices.length));
    const chosenIndex = args.strategy === 'early' ? 0 : args.strategy === 'late' ? solutionIndices.length - 1 : randomIndex;

    //Fire if block selected = [0] return true, else return false    
    const fire = solutionIndices[chosenIndex] === 0;
    //If we fire update the registry thingy
    if (fire) {
      const cardStates = this.driver.homey.app.triggerFlowCardState;
      cardStates[thisId] = atTimeMillis
      this.driver.homey.app.triggerFlowCardState = cardStates;
    }

    return fire;
  }

  /**
   * Apply a function to successive sub-arrays of a given length
   * @param   {any[]}           prices          Array to process apertures from
   * @param   {number}          apertureSize    Number of elements in each sub-array
   * @param   {function}        fn              Function to be applied to each sub-array
   * @result  {any[]}                           Result of applying the function to the successive sub-arrays                  
   */
  apertureMap(prices, apertureSize, fn) {
    return apertureSize > prices.length
      ? []
      : prices.slice(apertureSize - 1).map((v, i) => fn(prices.slice(i, i + apertureSize)));
  }

  /** 
   * Return the indices of the target value within the array
   * @param   {any[]}           array       Array to find the indices within
   * @param   {any}             target      Value to find within the array
   * @result  {integer[]}                   Indices of the value within the array
   */
  targetIndices(array, target) {
    return array.reduce((indices, value, index) => {
      if (value === target) indices.push(index);
      return indices;
    }, []);
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