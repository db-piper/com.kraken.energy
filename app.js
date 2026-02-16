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
        let result = false;

        try {
          const device = args?.device;
          const method = device?.getCurrentlyCheaper;

          // Only set to true if the method exists and evaluates to true
          if (typeof method === 'function') {
            result = !!method.call(device, args);
          }
        } catch (err) {
          // We don't need to return here; let it fall through to the final return
          this.error('[Listener Error] Relative Price Card:', err.message);
        }

        // The single exit point
        return result;
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
