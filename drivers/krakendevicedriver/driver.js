'use strict';

const Homey = require('homey');
const energyAccount = require('../../modules/energyAccount');
const productTariff = require('../../modules/productTariff');
const smartEnergyDevice = require('../../modules/smartEnergyDevice');
const managerEvent = require('../../modules/managerEvent');

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
      // const token = await this.eventer.getApiToken();
      // if (!token) throw new Error('Token acquisition failed');
      await this.eventer.executeEvent();
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
    //const fetcher = new dataFetcher(this.homey);
    const token = await this.eventer.getApiToken(apiKey);
    let success = false;
    if (token) {
      this.log(`krakenDriver.sessionLoginHandler: Token acquired calling app.setValidAccount`);
      success = await this.eventer.setValidAccount(account, token);
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
   * Ensures the heartbeat is active and synchronized to the :15s mark of every minute.
   * Uses Luxon for precise time-of-minute anchoring to prevent execution drift.
   */
  startEventPoller() {
    if (this._pollerTimeout) {
      this.log('krakenDriver.startEventPoller: Heartbeat already active.');
      return;
    }

    if (this.getDevices().length > 0) {
      const scheduleNext = () => {
        const now = this.eventer.DateTime.now();

        // Target the 15-second mark of the current minute
        let nextRun = now.set({ second: 15, millisecond: 0 });

        // If we are already past :15s, move target to the next minute
        if (nextRun <= now) {
          nextRun = nextRun.plus({ minutes: 1 });
        }

        const delay = nextRun.diff(now).milliseconds;

        // Recursive timeout ensures drift is corrected every minute
        this._pollerTimeout = this.homey.setTimeout(async () => {
          try {
            this.log(`krakenDriver.onHeartbeat: Tick start at ${this.eventer.DateTime.now().toISO()}`);
            await this.onHeartbeat();
          } catch (err) {
            this.error('krakenDriver.onHeartbeat: Error during execution', err);
          } finally {
            this._pollerTimeout = null;
            scheduleNext(); // Re-calculate the next :15s gap
          }
        }, delay);
      };

      scheduleNext();
      this.log('krakenDriver.startEventPoller: Poller anchored to :15s.');
    } else {
      this.log('krakenDriver.startEventPoller: No devices found. Standing by.');
    }
  }

  /**
   * Ensures the heartbeat is stopped.
   */
  stopEventPoller() {
    if (this._pollerTimeout) {
      this.homey.clearTimeout(this._pollerTimeout);
      this._pollerTimeout = null;
      this.log('krakenDriver.stopEventPoller: Poller stopped.');
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