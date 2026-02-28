'use strict';
const AccountIdSetting = "krakenAccountId";
const ApiKeySetting = "krakenApiKey";
const TokenSetting = "kraken_token";
const TokenExpirySetting = "kraken_token_expiry";

const Homey = require('homey');
const dataFetcher = require('./modules/dataFetcher');
const Queries = require('./modules/gQLQueries');

module.exports = class krakenApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.homey.log('krakenApp.onInit: App Initialization Started');
    this._dataFetcher = new dataFetcher(this.homey);

    this.registerConditionCardListener('slot_relative_price', 'getCurrentlyCheaper');
    this.registerConditionCardListener('price_less_than_tariff', 'getPriceLessThanTariff');

    this.homey.log('krakenApp.onInit: App Initialization Completed');
  }

  /**
   * onUninit is called when the app is terminating.
   */
  async onUninit() {
    this.log('krakenApp.onUninit: App has been terminated');
  }

  /**
   * Get a valid GQL token
   * @customTag                 sideeffects               Updates homey settings {TokenSetting} and {TokenExpirySetting} 
   * @param   {string|null}     [userSpecifiedKey=null]   Key specified by the user so that it can be tested for validity
   * @returns {promise<string>}                           Valid GQL token
   */
  async getValidToken(userSpecifiedKey = null) {
    let token = this.homey.settings.get(TokenSetting);
    let expiry = this.homey.settings.get(TokenExpirySetting);

    const isValid = token && expiry && (new Date() < new Date(expiry));

    if (!isValid) {
      this.log('krakenApp.getValidToken: GQL token absent or expired, requestng new token');

      ({ token, expiry } = await this.dataFetcher.login(userSpecifiedKey || this.apiKey));

      if (!token) {
        throw new Error(`API key does not grant access - use Homey's "Repair" option to provide a valid API key`);
      }

      this.homey.settings.set(TokenSetting, token);
      this.homey.settings.set(TokenExpirySetting, expiry);
      if (userSpecifiedKey) {
        this.homey.settings.set(ApiKeySetting, userSpecifiedKey);
      }
    }

    return token;
  }

  /**
   * Proves an Account ID can be accessed by the token derived from the API key and persists it.
   * @param   {string} accountId The ID to validate and store.
   * @param   {string} token     The valid JWT to use for the check.
   * @returns {Promise<boolean>}
   */
  async setValidAccount(accountId, token) {
    this.log(`krakenApp.setValidAccount: Validating account ${accountId}...`);
    const isValid = await this.dataFetcher.verifyAccountId(Queries.getPairingData(accountId), token);
    this.log(`krakenApp.setValidAccount: verifyAccountId returned ${isValid}`);

    if (isValid) {
      this.homey.settings.set(AccountIdSetting, accountId);
      this.log('krakenApp.setValidAccount: Account ID verified and saved.');
      return true;
    }

    return false;
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

  /**
   * Factory returning an instance of dataFetcher
   * @returns {dataFetcher} New instance of dataFetcher
   */
  get dataFetcher() {
    return this._dataFetcher;
  }

};
