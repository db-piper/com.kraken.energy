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

  /**
   * Evaluate trigger flow cards for the app
   * @param   {object}            futurePrices      The future prices for import and export tariffs
   * @param   {number}            atTimeMillis      The time in milliseconds to evaluate the trigger flow cards for
   * @returns {Promise<boolean>}                    True if the trigger flow cards were evaluated successfully
   */
  async evaluateTriggerFlowCards(futurePrices, atTimeMillis) {
    const { importPrices, exportPrices } = futurePrices;
    const flowCardDef = this.driver.homey.flow.getTriggerCard('bestBlockStrategy');
    this.driver.log(`managerEvent.evaluateTriggerFlowCards: flowCardDef id ${flowCardDef.id}`);
    const args = await flowCardDef.getArgumentValues();
    this.driver.log(`managerEvent.evaluateTriggerFlowCards: args ${JSON.stringify(args)}`);
    const isHalfHour = dayjs(atTimeMillis).tz(this.wrapper.timeZone).minute() % 30 === 0;
    if (args.length > 0 && isHalfHour) {
      const executedCards = this.driver.homey.app.triggerFlowCardState;
      const unfulfilled = args.filter((item) => !executedCards[this.hashFlowCardArgs(item)]);
      this.driver.log(`managerEvent.evaluateTriggerFlowCards: unfulfilled ${JSON.stringify(unfulfilled)}`);

      unfulfilled.forEach(item => {
        futurePrices = (item.direction === 'import') ? importPrices : exportPrices;
        if (futurePrices.length > 0) {
          const hash = this.hashFlowCardArgs(item);
          const state = {
            eventTime: atTimeMillis,
            prices: futurePrices,
            targetId: hash
          };
          const result = this.decideBestBlockCardExecution(item, state);
          if (result && result.fire) {
            const tokens = {
              'direction': item.direction,
              'duration': item.duration,
              'startTime': item.startTime,
              'endTime': item.endTime,
              'strategy': item.strategy,
              'identifier': item.identifier,
              'avePrice': Math.round(result.avePrice * 1000) / 1000,
              'blockStartTime': result.blockStartTime,
              'blockEndTime': result.blockEndTime
            };
            flowCardDef.trigger(tokens, { ...state, fire: true })
              .catch(err => this.driver.error(`Trigger Error: ${err}`));
            executedCards[hash] = atTimeMillis;
            this.driver.log(`managerEvent.evaluateTriggerFlowCards: Persisted Card Execution ${hash}`);
          }
        }
      });
      this.driver.homey.app.triggerFlowCardState = executedCards;
    }
  }

  hashFlowCardArgs(args) {
    return `${args.direction}_${args.duration}_${args.startTime}_${args.endTime}_${args.strategy}_${args.identifier}`;
  }

  /**
   * Evaluate if the current time is within the flow card window
   * @param   {object}  args            The arguments for the flow card
   * @param   {number}  atTimeMillis    The time in milliseconds to evaluate the flow card window
   * @returns {object}                  inWindow: boolean, eventTime: Date, endTime: Date
   */
  evaluateFlowCardWindow(args, atTimeMillis) {
    const eventTime = dayjs(atTimeMillis).tz(this.wrapper.timeZone).second(0).millisecond(0); //when called will be hh:00:00.000 or hh:30:00.000
    const sHhMm = args.startTime.split(":");
    let startTime = eventTime.hour(Number(sHhMm[0])).minute(Number(sHhMm[1]));
    const eHhMm = args.endTime.split(":");
    let endTime = startTime.hour(Number(eHhMm[0])).minute(Number(eHhMm[1]));
    if (endTime.isBefore(startTime)) {           // Window crosses midnight
      if (!eventTime.isBefore(startTime)) {      // Late in the day, so push the endTime into tomorrow
        endTime = endTime.add(1, 'day');
      } else {                                   // Early in the day, so push the startTime back into yesterday
        startTime = startTime.subtract(1, 'day');
      }
    }
    this.driver.log(`managerEvent.evaluateFlowCardWindow: eventTime ${eventTime.format()} startTime ${startTime.format()} endTime ${endTime.format()}`);
    const inWindow = (eventTime.isBefore(startTime) || eventTime.isAfter(endTime)) ? false : true;
    return { inWindow, eventTime, endTime };
  }

  /**
   * Get the relevant block prices for the flow card
   * @param   {array}   prices          The prices chunks in the window
   * @param   {number}  eventTime       The time in milliseconds marking the start of the window
   * @param   {number}  endTime         The time in milliseconds marking the end of the window
   * @param   {number}  blockChunks     The number of 30 minute chunks required by the flow card
   * @returns {array}                   The price of each relevant block
   */
  getWindowBlockPrices(prices, eventTime, endTime, blockChunks) {
    const maxPossibleChunks = Math.floor((endTime.valueOf() - eventTime.valueOf()) / 1800000);
    const endBlock = Math.min(prices.length, maxPossibleChunks);
    const relevantPrices = prices.slice(0, endBlock);
    return (relevantPrices.length < blockChunks) ?
      [] :
      this.apertureMap(relevantPrices, blockChunks, (window) => window.reduce((total, value) => total + value, 0));
  }

  /**
   * Decide if the zeroth block (current) satisfies the strategy defined on the card
   * @param   {array}   blockPrices         The price of each relevant block
   * @param   {string}  strategy            The strategy to use (early, late, random)
   * @param   {string}  direction           The direction of import/export
   * @returns {boolean}                     True if the flow card should be triggered, false otherwise
   */
  evaluateStrategy(blockPrices, strategy, direction) {
    const goalFunction = direction === 'import' ? Math.min : Math.max;
    const solutionIndices = this.targetIndices(blockPrices, goalFunction(...blockPrices));
    this.driver.log(`managerEvent.evaluateStrategy: solutionIndices ${solutionIndices}`);
    //Select the block according to the strategy - earliest = [0], latest = [length(cheapestBlocks) - 1], random = 1/length(cheapestBlocks)
    const randomIndex = Math.min((solutionIndices.length) - 1, Math.floor(Math.random() * solutionIndices.length));
    const chosenIndex = strategy === 'early' ? 0 : strategy === 'late' ? solutionIndices.length - 1 : randomIndex;
    this.driver.log(`managerEvent.evaluateStrategy: randomIndex ${randomIndex} chosenIndex ${chosenIndex}`);
    //Fire if block selected = [0] return true, else return false    
    const fire = solutionIndices[chosenIndex] === 0;
    this.driver.log(`managerEvent.evaluateStrategy: solutionIndices[chosenIndex] ${solutionIndices[chosenIndex]} fire ${fire}`);
    //const avePrice = blockPrices[0] / blockChunks;
    return fire;
  }

  /**
   * Decide whether to trigger a flow card based on the best block strategy
   * @param   {object}  args    The arguments for the flow card
   * @param   {object}  state   The state of application data relevant to the flow card
   * @returns {boolean}         True if the flow card should be triggered, false otherwise
   */
  decideBestBlockCardExecution(args, state) {
    this.driver.log(`managerEvent.decideBestBlockCardExecution: args ${JSON.stringify(args)}`);
    const { inWindow, eventTime, endTime } = this.evaluateFlowCardWindow(args, state.eventTime);
    //If not in the window then can't start yet
    if (!inWindow) return { fire: false };
    const blockChunks = 2 * Number(args.duration);
    const blockPrices = this.getWindowBlockPrices(state.prices, eventTime, endTime, blockChunks);
    this.driver.log(`managerEvent.decideBestBlockCardExecution: blockPrices ${JSON.stringify(blockPrices)}`);
    if (!blockPrices || blockPrices.length === 0) return { fire: false };
    const fire = this.evaluateStrategy(blockPrices, args.strategy, args.direction);
    this.driver.log(`managerEvent.decideBestBlockCardExecution: fire ${fire} blockPrices[0] ${blockPrices[0]} blockChunks ${blockChunks}`);
    return {
      fire: fire,
      avePrice: blockPrices[0] / blockChunks,
      blockStartTime: eventTime.format('HH:mm'),
      blockEndTime: eventTime.add(blockChunks * 30, 'minute').format('HH:mm')
    };
  }

  async executeBestBlockStrategyCard(args, state) {
    const thisId = this.hashFlowCardArgs(args);
    this.driver.log(`managerEvent.executeBestBlockStrategyCard: Fire card: ${thisId === state.targetId && state.fire}`);
    return (thisId === state.targetId) && state.fire
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