'use strict';

const Homey = require('homey');
const productTariff = require('../../modules/productTariff');
const energyAccount = require('../../modules/energyAccount');
const managerEvent = require('../../modules/managerEvent');
const smartEnergyDevice = require('../../modules/smartEnergyDevice');
const dataFetcher = require('../../modules/dataFetcher');

module.exports = class krakenDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('krakenDriver.onInit: Driver Initialization Started');
    this._maxPssPeak = 0;
    this.log(`krakenDriver.onInit: About to check if devices exist`);
    if (this.getDevices().length > 0) {
      try {
        this.log(`krakenDriver.onInit: Account ID: ${this.homey.app.accountId}`);
        const success = await this.sessionLoginHandler(this.homey.app.accountId, this.homey.app.apiKey);
        this.log(`krakenDriver.onInit: Login successful: ${success}`);
        if (success) {
          this.log(`krakenDriver.onInit: About to start event poller`);
          this.startEventPoller();
        }
      } catch (error) {
        this.log(`krakenDriver.onInit: Failed to initialise: ${error}`);
      }
    }
    this.log('krakenDriver.onInit: Driver Initialization Completed');
  }

  /**
   * onMapDeviceClass called before a device is initialized to identify a concrete implementation class for the device
   * @param     {Homey.Device}  device  The device whose implementation class is to be returned
   * @returns   {class}                 The concrete implementation class
   */
  onMapDeviceClass(device) {
    const deviceClass = device.getStoreValue("octopusClass");
    let nodeClass = undefined;
    const classSwitch = {
      "octopusTariff": productTariff,
      "octopusAccount": energyAccount,
      "smartDevice": smartEnergyDevice
    };
    if (deviceClass in classSwitch) {
      nodeClass = classSwitch[deviceClass];
      this.log(`krakenDriver.onMapDeviceClass: device nickname ${deviceClass} nodeClass ${nodeClass.name}`);
    }
    return nodeClass;
  }

  /**
   * This method is called when a pairing session starts.
   * @param {PairSession} session   The session using this driver
   */
  async onPair(session) {
    // let account = "";
    // let apiKey = "";

    /**
     * Set a handler for the login event
     * @param   {object}  data  contains credential login information
     * @returns {booelan}       true if valid credentials
     */
    session.setHandler("login", async (data) => {
      this.log("krakenDriver.onpair.setHandler(login) - starting");
      return this.sessionLoginHandler(data.username, data.password);
    });

    /**
     * Set a handler for the list_devices event
     * @returns {object}  Array of device definitions that can be selected for creation
     */
    session.setHandler("list_devices", async () => {
      this.log("krakenDriver.onPair.setHandler(list_devices) - starting");
      const deviceDefinitions = await this.eventer.getOctopusDeviceDefinitions();
      this.log(`krakenDriver.onPair.setHandler(list_devices) - returning ${deviceDefinitions.length} device definitions`);
      return deviceDefinitions;
    });
  }

  /**
   * This method is called when a re-pairing session starts.
   * @param {PairSession} session   The session using this driver
   * @param {Device}      device    The device being repaired
   */
  async onRepair(session, device) {
    // let account = "";
    // let apiKey = "";

    /**
     * Set a handler for the login event
     * @param   {object}  data  contains credential login information
     * @returns {boolean}       true if valid credentials
     */
    session.setHandler("login", async (data) => {
      this.log("krakenDriver.onRepair.setHandler(login) - starting");
      return this.sessionLoginHandler(data.username, data.password);
    });

  }

  /**
   * onUninit is called when the app is terminating.
   */
  async onUninit() {
    this.log("krakenDriver.onUninit - driver has been terminated");
    this.stopEventPoller();
  }

  get eventer() {
    return new managerEvent(this);
  }

  /**
   * The Heartbeat: The actual task performed every minute.
   */
  async onHeartbeat() {
    this.log(`krakenDriver.onHeartbeat: Tick start at ${new Date().toISOString()}`);
    try {
      const fetcher = new dataFetcher(this.homey);
      const token = await fetcher.getApiToken();
      if (!token) throw new Error('Token acquisition failed');
      await this.eventer.executeEvent(token);
    } catch (err) {
      this.homey.log(`krakenDriver.onHeartbeat: Failure: ${err.message}`);
      this.homey.log(`krakenDriver.onHeartbeat: Failure: ${err.stack}`);
      this.error('krakenDriver.onHeartbeat: Failure:', err.message);
    }
    this.log(`krakenDriver.onHeartbeat: Tick done at ${new Date().toISOString()}`);
  }

  /**
   * Update the max RSS peak if it's greater than the current max
   * @param {number} rss The RSS value to update 
   */
  set maxPssPeak(rss) {
    this._maxPssPeak = Math.max(this._maxPssPeak, rss);
  }

  /**
   * Return the max RSS peak
   */
  get maxPssPeak() {
    return this._maxPssPeak;
  }

  /**
   * Helper function used by onPair and onRepair to validate login parameters
   * @param   {string}  account   Account identifier
   * @param   {string}  apiKey    Kraken API Key for the identified account
   * @returns {Promise<boolean>}  True: valid login parameters; False: otherwise
   */
  async sessionLoginHandler(account, apiKey) {
    this.log("krakenDriver.sessionLoginHandler: Testing Access To Account GQL");
    const fetcher = new dataFetcher(this.homey);
    const token = await fetcher.getApiToken(apiKey);
    let success = false;
    if (token) {
      this.log(`krakenDriver.sessionLoginHandler: Token acquired calling app.setValidAccount`);
      success = await fetcher.setValidAccount(account, token);
      //success = await this.homey.app.setValidAccount(account, token);
      this.log(`krakenDriver.sessionLoginHandler: app.setValidAccount returned success: ${success}`);
      if (success) {
        this.startEventPoller();
      } else {
        throw new Error(this.homey.__('errors.invalid_account_id'));
      }
    }
    return success;
  }

  /**
   * Ensures the heartbeat is active and synchronized with current credentials.
   * Handles the "Phase Shift" by resetting the timer to the moment of validation.
   */
  startEventPoller() {
    if (this._interval) {
      this.log('krakenDriver.startEventPoller: Heartbeat already active.');
      return;
    }

    if (this.getDevices().length > 0) {
      this.log('krakenDriver.startEventPoller: No active poller found. Starting now.');

      const heartbeatTask = async () => {
        await this.onHeartbeat();
      };

      this._interval = this.eventer.setInterval(this.homey, 60000, heartbeatTask, (newId) => {
        this._interval = newId;
        this.log('krakenDriver.startEventPoller: Poller successfully initialized.');
      });
    } else {
      this.log('krakenDriver.startEventPoller: No devices extant. Standing by.');
    }
  }

  /**
   * Ensures the heartbeat is stopped.
   */
  stopEventPoller() {
    this.log('krakenDriver: Ensuring poller is stopped');
    if (this._interval) {
      this.homey.clearTimeout(this._interval);
      this.homey.clearInterval(this._interval);
      this._interval = undefined;
      this.log('krakenDriver: Poller stopped.');
    }
  }

  /**
   * Returns devices sorted by a custom priority list
   * @param   {string[]}        orderedKeys Class names of the devices in the priority order
   * @returns {Homey.Device[]}              Array of devices sorted by the priority list
   */
  getDevicesOrderedBy(orderedKeys) {
    const rankMap = Object.fromEntries(orderedKeys.map((key, i) => [key, i]));

    return [...this.getDevices()].sort((a, b) => {
      const rankA = rankMap[a.getStoreValue("octopusClass")] ?? Infinity;
      const rankB = rankMap[b.getStoreValue("octopusClass")] ?? Infinity;
      return rankA - rankB;
    });
  }

};