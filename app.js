'use strict';

const Homey = require('homey');
//const productTariff = require('./modules/productTariff');

module.exports = class krakenApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.homey.log('krakenApp.onInit: App has been initialized');
    this.homey.log(`krakenApp.registerConditionRunListener: card: slot_relative_price function: getCurrentCheaper`);

    const relativePriceCard = this.homey.flow.getConditionCard('slot_relative_price');
    if (relativePriceCard) {
      relativePriceCard.registerRunListener(async (args, state) => {
        // Use optional chaining for a slightly smaller memory footprint than '&& typeof'
        // and ensure we don't hold 'args' in memory longer than necessary
        try {
          return await args?.device?.getCurrentlyCheaper(args);
        } catch (err) {
          this.error('Error in slot_relative_price listener:', err);
          return false;
        }
      });
    }
  }

  /**
   * onUninit is called when the app is terminating.
   */
  async onUninit() {
    this.log('krakenApp.onUninit: App has been terminated');
  }

};
