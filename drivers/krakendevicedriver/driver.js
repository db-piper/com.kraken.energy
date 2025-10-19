'use strict';

const Homey = require('homey');
const productTariff = require('../../modules/productTariff');
const miniMeter = require('../../modules/miniMeter');
const energyAccount = require('../../modules/energyAccount');
const managerEvent = require('../../modules/managerEvent');

module.exports = class krakenDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this._period = 60000;
    this._managerEvent = new managerEvent(this);
    if (this.getDevices().length > 0){
      this._managerEvent.setInterval(this._period);
    } 
    // GASH - Unset accidentally established app settings
    const settings = this.homey.settings;
    const keys = settings.getKeys();
    for (const key of keys) {
      this.homey.log(`SETTING FOUND: ${key}:${this.homey.settings.get(key)}`);
      //settings.unset(key);
    }

    this.log('krakenDriver: onInit: driver has been initialized');
  }

  /**
   * onMapDeviceClass called before a device is initialized to identify a concrete implementation class for the device
   * @param     {Homey.Device}  device  The device whose implementation class is to be returned
   * @returns   {class}                 The concrete implementation class 
   */
  onMapDeviceClass(device) {
    this.log("KrakenDeviceDriver.onMapDeviceClass");
    const deviceClass = device.getStoreValue("octopusClass");
    this.log(`KrakenDeviceDriver.onMapDeviceClass: ${deviceClass}`);
    let nodeClass = undefined;
    switch (deviceClass) {
      case "octopusTariff":
        this.log(`KrakenDeviceDriver.onMapDeviceClass: class is productTariff`);
        nodeClass = productTariff;
        break;
      case "octopusMini":
        this.log(`KrakenDeviceDriver.onMapDeviceClass: class is miniMeter`);
        nodeClass = miniMeter;
        break;
      case "octopusAccount":
        this.log(`KrakenDeviceDriver.onMapDeviceClass: class is energyAccount`);
        nodeClass = energyAccount;
        break;
      default:
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

    session.setHandler("login", async (data) => {
      this.log("krakenDriver.onpair.setHandler(login) - starting");
      let account = data.username;
      let apiKey = data.password;
      this.log("krakenDriver.onpair.login: Testing Access To Account GQL");
      const success = await this._managerEvent.testAccessParameters(account, apiKey);
      this.log(`krakenDriver.onpair.login: Access test complete: ${success}`);
      if (success) {
        this.log("krakenDriver.onpair.login: Setting access parameters");
        this._managerEvent.setAccessParameters(account, apiKey);
        this._managerEvent.setInterval(this._period);
      }
      return success;
    });

    session.setHandler("list_devices", async () =>{
      this.log("krakenDriver.onPair.setHandler(list_devices) - starting");
      const deviceDefinitions = await this._managerEvent.getOctopusDeviceDefinitions();
      return deviceDefinitions;
    });  
  }

  /**
   * onUninit is called when the app is terminating.
   */
  async onUninit() {
    this.log("krakenDriver.onUninit - driver has been terminated");
    this._managerEvent.unSetInterval();
  }

  get managerEvent() {
    return this._managerEvent;
  }

};
