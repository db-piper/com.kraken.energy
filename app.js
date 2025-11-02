'use strict';

const Homey = require('homey');
const productTariff = require('./modules/productTariff');

/**
 * 
 * DONE: "New Period" trigger card on Octopus Account device
 * DONE: Better icon for energyAccount device
 * DONE: Work out git usage
 * DONE: Projected bill algorithm
 * DONE: In the pairing process confirm there is a live meter id available; if not return no devices
 * DONE: Device Repair Functionality
 * DONE: Work out how to "subclass" Tariff devices with different sets of capabilities.
 * TODO: Fix the single slot problem for Tracker Tariff 
 * TODO: Work out and implement capability changes for single slot Tracker
 * TODO: Release new version with these changes
 * TODO: Research and understand dispatches on intelligent tariffs
 * TODO: Implement basic dispatch fetching code and relevant error processing in GetAccountData
 * TODO: Put flexPlannedDispatches in with LiveMeterData query to ensure frequency of reading
 * TODO: Review all classes, complete comments and remove redundant functions
 * TODO: Review subject factoring for device classes and krakenAccountWrapper
 * TODO: Convert to TypeScript
 * TODO: Subclass the productTariff class to differentiate half-hourly and non-halfhourly tariffs
 * TODO: Add support for Octopus Saving periods including auto-registration
 * TODO: Consider use of the Home Assistant hack for free-energy periods (how reliable is it??)
 * TODO: Tariff efficiency measures on half-hourly tariff based on power consumed in each Quartile range (new device?)
 */

module.exports = class krakenApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.homey.log('krakenApp.onInit: App has been initialized');
    this.registerConditionRunListener('slot_relative_price', productTariff.prototype.getCurrentlyCheaper)
	}

  /**
   * Register the named function on the device class as the listener for the named condition flow card 
   * @param {string}   cardName       The name of the condition card getting the listener
   * @param {function} handlerFunction   The name of the function
   */
  registerConditionRunListener(cardName, handlerFunction) {
    this.homey.log(`krakenApp.registerConditionRunListener: card ${cardName} function: ${handlerFunction.name}`);
    //TODO: Research if the function reference can be passed rather than the function name
    this.homey.flow.getConditionCard(cardName).registerRunListener(this.runListenerExecutor.bind(this, handlerFunction.name));
  }

  /**
   * Run the named function in the context of the class specific in args.device with args as parameter
   * @param {string} functionName   The name of the handler function
   * @param {object} args           args.device is the device instance 
   * @param {object} state          Current homey state 
   * @returns 
   */
  async runListenerExecutor(functionName, args, state) {
    this.homey.log(`krakenApp.runListenerExecutor: ${functionName}`)
    const result = args.device[functionName](args);
    return result;
  }
  
  /**
   * onUninit is called when the app is terminating.
   */
  async onUninit() {
    this.log('krakenApp.onUninit: App has been terminated');
  }

};
