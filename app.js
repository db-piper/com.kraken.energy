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
    //GASH
    const token = this.homey.settings.get(TokenSetting);
    if (token && token.startsWith('JWT ')) {
      this.homey.settings.set(TokenSetting, token.replace('JWT ', '').trim());
    }
    //END GASH

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
