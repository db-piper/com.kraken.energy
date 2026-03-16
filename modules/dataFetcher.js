'use strict';
const homey = require("homey");
const { DateTime } = require('../bundles/luxon');
const Queries = require('./gQLQueries');
const { TokenSetting, TokenExpirySetting, ApiKeySetting, AccountIdSetting, EventTime, DriverSettingNames } = require('./constants');

module.exports = class dataFetcher {
  /**
   * dataFetcher performs all {fetch} activity for GraphQL queries. Current implementation assumes
   * octopus.energy account.
   */

  /**
   * Constructor for dataFetcher. Class that performs all access to the REST API and GraphQL API 
   * @param {Homey}   homey  hosts the app
   */
  constructor(homey) {
    homey.log(`dataFetcher.constructor: Instantiating`);
    this._homey = homey;
    this._baseURL = 'https://api.octopus.energy';
    this._graphQlPath = '/v1/graphql/';
    this._hourMilliSeconds = 60 * 60 * 1000;
    this._dayMilliSeconds = 24 * this._hourMilliSeconds;
  }

  /**
   * Return the homey instance
   * @returns {homey} the homey instance
   */
  get homey() {
    return this._homey;
  }

  /**
   * Get a valid GQL token
   * @customTag                 sideeffects               Updates homey settings {TokenSetting} and {TokenExpirySetting} 
   * @param   {string|null}     [userSpecifiedKey=null]   Key specified by the user so that it can be tested for validity
   * @returns {promise<string>}                           Valid GQL token
   */
  async getApiToken(userSpecifiedKey = null) {

    const activeApiKey = userSpecifiedKey || this.apiKey;

    if (!activeApiKey) {
      this.homey.log('dataFetcher.getApiToken: No API Key available in settings or arguments.');
      return undefined;
    }

    let token = this.homey.settings.get(TokenSetting);
    let expiry = this.homey.settings.get(TokenExpirySetting);

    const isValid = token && expiry && Date.now() < expiry;

    if (!isValid) {
      this.homey.log('dataFetcher.get apiToken: GQL token absent or expired, requestng new token');

      ({ token, expiry } = await this.login(activeApiKey));

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
   * Return the current API key
   * @returns {string}  API key
   */
  get apiKey() {
    return this.homey.settings.get(ApiKeySetting);
  }


  /**
   * Make a query on the Octopus GraphQL API
   * @param   {string} queryString  the GraphQL query to be performed
   * @returns {promise<object>}     a JSON object representing the result of the query or undefined if query fails to execute
   */
  async getDataUsingGraphQL(queryString, apiKey) {
    this.homey.log("datafetcher.getDataUsingGraphQL: starting");
    let validToken = await this.getApiToken(apiKey);
    if (validToken) {
      try {
        let result = await this.runGraphQlQuery(queryString, validToken);
        if ((result !== undefined) && ("data" in result)) {
          return result;
        } else {
          this.homey.log(`dataFetcher.getDataUsingGraphQL: malformed query result:`);
          this.homey.log(JSON.stringify(result));
          return undefined;
        }
      } catch (err) {
        this.homey.log("datafetcher.getDataUsingGraphQL: error block");
        this.homey.log(err);
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  /**
   * Execute the specified GraphQL query with an authorization header if needed
   * @param   {string}          queryString   The GraphQL query to be performed
   * @param   {string}          token         Current GraphQL access token (empty if no security header is needed)
   * @returns {promise<object>}               JSON object with results of query or undefined. If there is a GQL problem, query succeeds but JSON contains error information
   */
  async runGraphQlQuery(queryString, token) {
    this.homey.log("dataFetcher.runGraphQlQuery: starting");
    try {
      const url = `${this._baseURL}${this._graphQlPath}`;
      let fetchParams = this.buildGraphQLFetchParams(queryString, token);

      let response = await fetch(url, fetchParams); // Use await with fetch

      if (!response.ok) {
        const errorText = await response.text(); // Read the error response body
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      let rawjson = await response.json();
      //const result = JSON.parse(JSON.stringify(rawjson));
      const result = structuredClone(rawjson);

      rawjson = null;
      response = null;
      fetchParams = null;

      if (typeof global.gc === 'function') {
        this.homey.log('dataFetcher.runGraphQlQuery: manual GC trigger');
        global.gc();
      } else {
        // If this logs, we know the "Lazy PSS" isn't solvable via manual GC
        this.homey.log('dataFetcher.runGraphQlQuery: global.gc is not available');
      }

      return result;
    }
    catch (err) {
      this.homey.log("dataFetcher.runGraphQlQuery: error block");
      this.homey.log(err);
      return undefined;
    }
  }

  /**
   * Build the parameters object for fetch using GraphQL
   * @param   {string}            queryString   GraphQL Query string to be passed as the payload
   * @param   {string|undefined}  token         GraphQl access token
   * @returns {object}                        Query parameters name value pairs
   */
  buildGraphQLFetchParams(queryString, token = undefined) {
    let params = {
      method: 'POST',
      body: queryString,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }
    if (token !== undefined) {
      params.headers["Authorization"] = `Bearer ${token}`;
    }
    return params;
  }

  /**
   * Get a new API token and expiry data
   * @param   {string}                                                       apiKey   apiKey to generate a token for
   * @returns {Promise<{token: string|undefined, expiry: string|undefined}>}          new access token and expiry date  
   */
  async login(apiKey) {
    this.homey.log(`dataFetcher.login: Starting: apiKey: ${apiKey}`);
    const query = Queries.getKrakenTokenQuery(apiKey);
    const result = await this.runGraphQlQuery(query, undefined);
    let token = undefined;
    let expiry = undefined;
    if (result?.data?.obtainKrakenToken) {
      token = result.data.obtainKrakenToken.token;
      expiry = 1000 * (result.data.obtainKrakenToken.payload.exp - 60);
    }
    return { token, expiry };
  }

  /**
   * Proves an Account ID can be accessed by the token derived from the API key and persists it.
   * @param   {string} accountId The ID to validate and store.
   * @param   {string} token     The valid JWT to use for the check.
   * @returns {Promise<boolean>}
   */
  async setValidAccount(accountId, token) {
    this.homey.log(`dataFetcher.setValidAccount: Validating account ${accountId}...`);
    const isValid = await this.verifyAccountId(Queries.getPairingData(accountId), token);
    this.homey.log(`dataFetcher.setValidAccount: verifyAccountId returned ${isValid}`);

    if (isValid) {
      this.homey.settings.set(AccountIdSetting, accountId);
      this.homey.log('dataFetcher.setValidAccount: Account ID verified and saved.');
      return true;
    }

    return false;
  }


  /**
   * Verify that the specified account ID can be accessed by the specified token
   * @param {string} queryString   The GraphQL used to verify accountId
   * @param {string} token         GraphQl access token
   * @returns {Promise<boolean>}   True if the account ID can be accessed by the token, false otherwise
   */
  async verifyAccountId(queryString, token) {
    const result = await this.runGraphQlQuery(queryString, token);
    let isValid = false;
    if (result.data.account !== null) {
      isValid = true;
    }
    return isValid;
  }

}