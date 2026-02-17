'use strict';

const Homey = require('homey');
//const productTariff = require('./modules/productTariff');

module.exports = class krakenApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.homey.log('krakenApp.onInit: App Initialization Started');
    this.homey.log(`krakenApp.registerConditionRunListener: card: slot_relative_price function: getCurrentCheaper`);

    const relativePriceCard = this.homey.flow.getConditionCard('slot_relative_price');
    if (relativePriceCard) {
      relativePriceCard.registerRunListener(async (args, state) => {
        let result = false;

        try {
          const device = args?.device;
          const method = device?.getCurrentlyCheaper;
          if (typeof method === 'function') {
            result = !!method.call(device, args);
          }
        } catch (err) {
          this.error('[Listener Error] Relative Price Card:', err.message);
        }
        return result;
      });
    }
    this.homey.log('krakenApp.onInit: App Initialization Completed');
  }

  /**
   * onUninit is called when the app is terminating.
   */
  async onUninit() {
    this.log('krakenApp.onUninit: App has been terminated');
  }

};
