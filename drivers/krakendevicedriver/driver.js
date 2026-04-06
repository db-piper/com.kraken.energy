'use strict';

const Homey = require('homey');
const energyAccount = require('../../modules/energyAccount');
const productTariff = require('../../modules/productTariff');
const smartEnergyDevice = require('../../modules/smartEnergyDevice');
const managerEvent = require('../../modules/managerEvent');
const krakenAccountWrapper = require('../../modules/krakenAccountWrapper');

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
        this.log(`krakenDriver.onInit: Login successful: ${success} event processing should start`);
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
    this._eventer = null;
    this._wrapper = null;
  }

  get eventer() {
    if (!this._eventer) {
      this._eventer = new managerEvent(this);
    }
    return this._eventer;
  }

  get wrapper() {
    if (!this._wrapper) {
      this._wrapper = new krakenAccountWrapper(this);
    }
    return this._wrapper;
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
   * Return the target interval in minutes
   * @returns {number}  The target interval in minutes
   */
  get targetIntervalMinutes() {
    return this.getDevices().length > 0 ? Number(this.getDevices()[0].getSetting('krakenPollingInterval')) : 1;
  }

  /**
   * The Heartbeat: The actual task performed every minute.
   * @returns {Promise<boolean>}   The current event completed without a detected error
   */
  async onHeartbeat() {
    this.log(`krakenDriver.onHeartbeat: Tick start at ${new Date().toISOString()}`);
    let success = false;
    try {
      if (this.getDevices().length > 0) {
        await this.eventer.executeEvent()
        success = true;
      } else {
        this.log(`kraken Driver.onHeartbeat: No devices found, resetting the app state`);
        this.stopEventPoller();
        this.log(`krakenDriver.onHeartbeat: Event poller stopped`);
        this.homey.app.resetState();
        this.log(`krakenDriver.onHeartbeat: App state reset`)
      }
    } catch (err) {
      this.homey.log(`krakenDriver.onHeartbeat: Failure: ${err.message}`);
      this.homey.log(`krakenDriver.onHeartbeat: Failure: ${err.stack}`);
      this.error('krakenDriver.onHeartbeat: Failure:', err.message);
    } finally {
      this._eventer = null;
      this._wrapper = null;
    }
    this.log(`krakenDriver.onHeartbeat: Tick done at ${new Date().toISOString()}`);
    return success;
  }

  /**
   * Helper function used by onPair and onRepair to validate login parameters
   * @param   {string}  account   Account identifier
   * @param   {string}  apiKey    Kraken API Key for the identified account
   * @returns {Promise<boolean>}  True: valid login parameters; False: otherwise
   */
  async sessionLoginHandler(account, apiKey) {
    this.log("krakenDriver.sessionLoginHandler: Testing Access To Account GQL");
    const token = await this.eventer.getApiToken(apiKey);
    let success = false;
    if (token) {
      this.log(`krakenDriver.sessionLoginHandler: Token acquired calling app.setValidAccount`);
      success = await this.eventer.setValidAccount(account, token);
      this.log(`krakenDriver.sessionLoginHandler: app.setValidAccount returned success: ${success}`);
      if (success) {
        this.startEventPoller();
        // } else {
        //   throw new Error(this.homey.__('errors.invalid_account_id'));
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
      this.log('krakenDriver.startEventPoller: Resetting existing heartbeat.');
      this.homey.clearTimeout(this._pollerTimeout);
      this._pollerTimeout = null;
    }

    let failureCount = 0;
    const maxFailures = 5;

    if (this.getDevices().length > 0) {
      const scheduleNext = () => {
        const now = this.eventer.DateTime.now().setZone(this.wrapper.timeZone);
        const offset = this.eventer.targetSecond;
        const interval = this.targetIntervalMinutes;

        // 1. Find the next "Grid Line" for the chosen interval
        let nextMinute = Math.ceil(now.minute / interval) * interval;

        // 2. Set the target time
        let nextRun = now.set({ minute: nextMinute, second: offset, millisecond: 0 });

        // 3. THE "MISS THE BUS" GUARD
        // If we finished the last job at :16 and the target was :15, 
        // or if Math.ceil gave us the 'current' minute which is already gone.
        if (now >= nextRun) {
          nextMinute += interval;

          if (nextMinute >= 60) {
            nextRun = now.plus({ hours: 1 }).set({ minute: 0, second: offset, millisecond: 0 });
          } else {
            nextRun = now.set({ minute: nextMinute, second: offset, millisecond: 0 });
          }
        }

        // 4. Calculate the "Elastic" Delay
        const delay = nextRun.diff(now).milliseconds;

        this.log(`krakenDriver.startEventPoller: Next heartbeat: ${nextRun.toFormat('HH:mm:ss')} (Wait: ${delay}ms)`);
        // Recursive timeout ensures drift is corrected every minute
        this._pollerTimeout = this.homey.setTimeout(async () => {
          try {
            await this.onHeartbeat();
            failureCount = 0;
          } catch (err) {
            this.error('krakenDriver.startEventPoller.setTimeout: Error during heartbeat execution', err);
            failureCount++;
          } finally {
            this._pollerTimeout = null;
            if (this.getDevices().length > 0 && failureCount < maxFailures) {
              scheduleNext(); // Re-calculate the next :15s gap
            } else {
              this.stopEventPoller();
            }
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
   * Announce to all devices that the dispatch minute count has changed
   * @param {number}  minutes The total number of minutes dispatched today
   */
  announceDispatchMinuteTotal(minutes) {
    this.log(`krakenDriver.announceDispatchMinuteTotal: Announcing: ${minutes}`);
    const devices = this.getDevices();
    devices.forEach(device => {
      device.dispatchMinutes = minutes;
    });
  }

};