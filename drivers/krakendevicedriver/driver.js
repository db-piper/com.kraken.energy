'use strict';

const Homey = require('homey');
const productTariff = require('../../modules/productTariff');
const energyAccount = require('../../modules/energyAccount');
const managerEvent = require('../../modules/managerEvent');
const smartEnergyDevice = require('../../modules/smartEnergyDevice');
const krakenAccountWrapper = require('../../modules/krakenAccountWrapper');

module.exports = class krakenDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('krakenDriver.onInit: Driver Initialization Started');
    this._accountWrapper = new krakenAccountWrapper(this);
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
    let account = "";
    let apiKey = "";

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
      const deviceDefinitions = await this._managerEvent.getOctopusDeviceDefinitions();
      return deviceDefinitions;
    });
  }

  /**
   * This method is called when a re-pairing session starts.
   * @param {PairSession} session   The session using this driver
   * @param {Device}      device    The device being repaired
   */
  async onRepair(session, device) {
    let account = "";
    let apiKey = "";

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

  /**
   * The Heartbeat: The actual task performed every minute.
   */
  async onHeartbeat() {
    this.log(`krakenDriver.onHeartbeat: Tick start at ${new Date().toISOString()}`);
    try {
      const token = await this.homey.app.getValidToken();
      if (!token) throw new Error('Token acquisition failed');
      const eventer = new managerEvent(this);
      await eventer.executeEvent(token);
    } catch (err) {
      this.error('krakenDriver.onHeartbeat: Failure:', err.message);
    }
    this.log(`krakenDriver.onHeartbeat: Tick done at ${new Date().toISOString()}`);
  }


  /**
   * Return the account wrapper instance
   */
  get accountWrapper() {
    return this._accountWrapper;
  }

  /**
   * Helper function used by onPair and onRepair to validate login parameters
   * @param   {string}  account   Account identifier
   * @param   {string}  apiKey    Kraken API Key for the identified account
   * @returns {Promise<boolean>}  True: valid login parameters; False: otherwise
   */
  async sessionLoginHandler(account, apiKey) {
    this.log("krakenDriver.sessionLoginHandler: Testing Access To Account GQL");
    let success = false;
    const token = await this.homey.app.getValidToken(apiKey);
    if (token) {
      this.log(`krakenDriver.sessionLoginHandler: Token acquired calling app.setValidAccount`);
      success = await this.homey.app.setValidAccount(account, token);
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
    this.log('krakenDriver.startEventPoller: Stopping any existing poller');
    this.stopEventPoller();

    if (this.getDevices().length > 0) {
      const scheduler = new managerEvent(this);
      const heartbeatTask = async () => {
        await this.onHeartbeat();
      };
      this.log('krakenDriver.runEventPoller: Starting fresh 60s interval.');
      this._interval = scheduler.setInterval(this.homey, 60000, heartbeatTask, (newId) => {   //FREQ
        this._interval = newId; // The Driver manages its own property
        this.log('krakenDriver.runEventPoller: Poller transitioned from Wait to Loop.');
      });
    } else {
      this.log('krakenDriver.runEventPoller: No devices found. Poller isdormant.');
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
