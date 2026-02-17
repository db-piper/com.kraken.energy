'use strict';

const Homey = require('homey');
const productTariff = require('../../modules/productTariff');
const energyAccount = require('../../modules/energyAccount');
const managerEvent = require('../../modules/managerEvent');
const smartEnergyDevice = require('../../modules/smartEnergyDevice');

module.exports = class krakenDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('krakenDriver.onInit: Driver Initialization Started');
    this._period = 60000;                         //FREQ - change to look at the settings
    this._managerEvent = new managerEvent(this);
    if (this.getDevices().length > 0) {
      await this._managerEvent.setInterval(this._period);
      const accessParameters = this._managerEvent.getAccessParameters();
      if (accessParameters.accountId !== undefined) {
        const success = await this._managerEvent.testAccessParameters(accessParameters.accountId, accessParameters.apiKey);
        this.log(`krakenDriver.onInit: Test access parameters: ${success}`)
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
      const deviceDefinitions = this._managerEvent.getOctopusDeviceDefinitions();
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
    this._managerEvent.unSetInterval();
  }

  /**
   * Return the event manager instance
   */
  get managerEvent() {
    return this._managerEvent;
  }

  /**
   * Helper function used by onPair and onRepair to validate login parameters
   * @param   {string}  account   Account identifier
   * @param   {string}  apiKey    Kraken API Key for the identified account 
   * @returns {boolean}           True: valid login parameters; False: otherwise
   */
  async sessionLoginHandler(account, apiKey) {
    this.log("krakenDriver.sessionLoginHandler: Testing Access To Account GQL");
    const success = await this._managerEvent.testAccessParameters(account, apiKey);
    this.log(`krakenDriver.sessionLoginHandler: Access test complete: ${success}`);
    if (success) {
      this._managerEvent.setAccessParameters(account, apiKey);
      await this._managerEvent.setInterval(this._period);
    }
    return success;
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
