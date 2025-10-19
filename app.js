'use strict';

const Homey = require('homey');

/**
 * 
 * DONE: "New Period" trigger card on Octopus Account device
 * DONE: Better icon for energyAccount device
 * DONE: Work out git usage
 * TODO: Projected bill algorithm
 * TODO: Review all classes, complete comments and remove redundant functions
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
    this.log('krakenApp.onInit: App has been initialized');
    this.homey.log(`krakenApp.onInit: Registering run listener`);
    this.registerConditionRunListener('slot_relative_price', 'getCurrentlyCheaper');
	}

  registerConditionRunListener(cardName, functionName) {
    this.homey.flow.getConditionCard(cardName).registerRunListener(this.runListenerExecutor.bind(this, functionName));
  }

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
