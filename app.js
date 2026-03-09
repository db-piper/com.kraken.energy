'use strict';
const { TokenSetting, TokenExpirySetting, ApiKeySetting, AccountIdSetting, DriverSettingNames } = require('./modules/constants');
const Homey = require('homey');
//const dataFetcher = require('./modules/dataFetcher');
//const Queries = require('./modules/gQLQueries');

module.exports = class krakenApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.homey.log('krakenApp.onInit: App Initialization Started');
    //this._dataFetcher = new dataFetcher(this.homey);

    this.registerConditionCardListener('slot_relative_price', 'getCurrentlyCheaper');
    this.registerConditionCardListener('price_less_than_tariff', 'getPriceLessThanTariff');

    this.homey.log('krakenApp.onInit: App Initialization Completed');
  }

  /**
   * onUninit is called when the app is terminating.
   */
  async onUninit() {
    this.homey.log('krakenApp.onUninit: App has been terminated');
  }

  /**
   * Generic helper to link a Condition Card to a specific Device method
   * @param {string} cardId     The ID of the flow card
   * @param {string} methodName The name of the method to call on the device
   */
  registerConditionCardListener(cardId, methodName) {
    this.homey.log(`krakenApp: Registering listener for ${cardId} -> ${methodName}`);
    const card = this.homey.flow.getConditionCard(cardId);
    if (card) {
      card.registerRunListener(async (args, state) => {
        let result = false;

        try {
          const device = args?.device;
          if (!device) {
            throw new Error(`[Listener Error] No device selected for ${cardId}.`);
          }
          const method = device?.[methodName];
          if (typeof method === 'function') {
            result = await device[methodName](args, state);
          } else {
            throw new Error(`Method ${methodName} not found on device ${device.getName()}.`);
          }
        } catch (err) {
          this.error(`[Listener Error] ${cardId}: Condition card `, err.message);
        }
        return result;
      });
    }
  }

  /**
   * Return the current API key
   * @returns {string}  API key
   */
  get apiKey() {
    return this.homey.settings.get(ApiKeySetting);
  }

  /**
   * Return the Account ID
   * @returns {string}  Account ID
   */
  get accountId() {
    return this.homey.settings.get(AccountIdSetting);
  }

};
