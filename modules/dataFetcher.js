'use strict';

module.exports = class dataFetcher {
  /**
   * dataFetcher performs all {fetch} activity for REST and GraphQL queries. Current implementation assumes
   * octopus.energy account.
   */

  /**
   * Constructor for dataFetcher. Class that performs all access to the REST API and GraphQL API 
   * @param {object - driver}   driver  controls the devices
   */
  constructor(driver) {
    driver.homey.log(`dataFetcher.constructor: Instantiating`);
    this._driver = driver;
    this._baseURL = 'https://api.octopus.energy';
    this._graphQlPath = '/v1/graphql/';
    this._hourMilliSeconds = 60 * 60 * 1000;
    this._dayMilliSeconds = 24 * this._hourMilliSeconds;
    this._tokenExpiry = undefined;
    this._graphQlApiToken = undefined;
  }

  /**
   * Return the homey instance
   * @returns {object - Homey} the homey instance
   */
  get homey() {
    return this._driver.homey;
  }

  /**
   * Return the GraphQL API token value
   * @returns {string} the current GraphQL API token
   */
  get graphQlApiToken() {
    return this._graphQlApiToken;
  }

  /**
   * Return the GraphQL token expiry date-time as a date
   * @returns {date}  the current GraphQL token expiry date-time
   */
  get tokenExpiry() {
    if (this._tokenExpiry !== undefined) {
      return new Date(this._tokenExpiry);
    } else {
      return undefined;
    }
  }

  /**
   * Make a query on the Octopus GraphQL API
   * @param   {string} queryString  the GraphQL query to be performed
   * @returns {object}              a JSON object representing the result of the query or undefined if query fails to execute
   */
  async getDataUsingGraphQL(queryString, apiKey) {
    this.homey.log("datafetcher.getDataUsingGraphQL: starting");
    let validToken = await this.getGraphQlApiToken(apiKey);
    if (validToken) {
      try {
        let result = await this.runGraphQlQuery(queryString, this.graphQlApiToken);
        if ((result !== undefined) && (!result.hasOwnProperty("errors"))) {
          return result;
        } else {
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
   * Return the query string to obtain the Kraken API Token
   * @returns {string} Stringified JSON representing the query
   */
  getKrakenTokenQuery(apiKey) {
    this.homey.log(`dataFetcher.getKrakenTokenQuery: starting`);
    //const apiKey = this.apiKey;
    this.homey.log(`dataFetcher.getKrakenTokenQuery: apiKey: ${apiKey}`);
    let query = {
      query: `mutation GetKrakenToken($apikey: String!) {
        obtainKrakenToken(input: {APIKey: $apikey}) {
          token
          refreshToken
          refreshExpiresIn
          payload
        }
      }`,
      variables: {
        apikey: apiKey,
      },
      operationName: "GetKrakenToken"
    }
    return JSON.stringify(query, null, 2);
  }


  /**
   * Check the currency of the GraphQL API Token and refresh it if need be
   * @returns {boolean} TRUE if a valid GraphQL API Token is available, FALSE otherwise
   */
  async getGraphQlApiToken(apiKey) {
    this.homey.log("dataFetcher.getGraphQlApiToken - starting");
    if (this.tokenExpiry > Date.now() && this.graphQlApiToken !== undefined) {
      this.homey.log(`dataFetcher.getGraphQlApiToken: Valid token; no fetch needed. Expiry: ${this.tokenExpiry.toISOString()}`);
      return true;
    } else {
      try {
        this.homey.log("dataFetcher.getGraphQlApiToken: No valid token detected, about to run GetKrakenToken GQL query.");
        const obtainKrakenTokenQuery = this.getKrakenTokenQuery(apiKey);
        const result = await this.runGraphQlQuery(obtainKrakenTokenQuery, undefined);
        this.homey.log("dataFetcher.getGraphQlApiToken: Back from GetKrakenToken GQL query.");
        if (result !== undefined && !result.hasOwnProperty("errors")) {
          let graphQlApiToken = result.data.obtainKrakenToken.token;
          let tokenExpiry = new Date(1000 * (result.data.obtainKrakenToken.payload.exp - 60));
          this._graphQlApiToken = graphQlApiToken;
          this._tokenExpiry = tokenExpiry.toISOString();
          this.homey.log(`dataFetcher.getGraphQlApiToken: QL API Token: ${this._graphQlApiToken}: Expiry: ${this._tokenExpiry}`);
          //this.homey.settings.set("tokenExpiry", tokenExpiry.toISOString());
          //this.homey.settings.set("graphQlApiToken", graphQlApiToken);
          return true;
        } else {
          this.homey.log("dataFetcher.getGraphQlAPIToken: errors property found, throwing error");
          throw new Error(`Unable to get the GraphQL API Token.`);
        }
      }
      catch (err) {
        this.homey.log("dataFetcher.getGraphQlApiToken: Catch block.");
        this.homey.log(err);
        return false;
      }
    }
  }

  /**
   * Execute the specified GraphQL query with an authorization header if needed
   * @param {string}  queryString   The GraphQL query to be performed
   * @param {string}  token         Current GraphQL access token 
   * @param {boolean} authorization Indicates if an authorization header containing the Graph QL API Token is needed 
   * @returns {object}              JSON object with results of query or undefined. If there is a GQL problem, query succeeds but JSON contains error information
   */
  async runGraphQlQuery(queryString, token) {
    this.homey.log("dataFetcher.runGraphQlQuery: starting");
    //this.homey.log(`dataFetcher.runGraphQlQuery: GQL Token: ${JSON.stringify(token, null, 2)}`)
    try {
      const url = `${this._baseURL}${this._graphQlPath}`;
      let fetchParams = this.buildGraphQLFetchParams(queryString, token);

      let response = await fetch(url, fetchParams); // Use await with fetch
      this.homey.log(`dataFetcher.runGraphQlQuery: Back from FETCH. Response: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text(); // Read the error response body
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      let result = await response.json();
      this.homey.log("dataFetcher.runGraphQlQuery: JSON received");
      //this.homey.log(JSON.stringify(result,null,2));

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
   * @param {string}  queryString   GraphQL Query string to be passed as the payload
   * @param {string}  token         GraphQl access token
   * @param {boolean} authorization indicates whether an authorization header is needed
   * @returns {object} query parameters name value pairs
   */
  buildGraphQLFetchParams(queryString, token) {
    let params = {
      method: 'POST',
      body: queryString,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }
    if (token !== undefined) {
      params.headers["Authorization"] = token;
    }
    return params;
  }

  /**
   * Run a query using the Octopus Energy REST API
   * @param {string}  url           the REST url for the query 
   * @param {boolean} authorization the request must be run with basic authorization
   * @returns {object}              JSON result of the query or undefined
   */
  async getDataUsingRest(url, authorization=true) {
    this.homey.log("dataFetcher.getDataUsingRest: Starting");
    const params = this.buildRestFetchParams(authorization);
    try {
      const response = await fetch(url, params);
      this.homey.log(`Status code: ${response.status}`);
      if (response.ok) {
        let restJSON = response.json();
        this.homey.log("dataFetcher.getDataUsingRest: About to return restJSON:");
        return restJSON;
      } else {
        this.homey.log("dataFetcher.getDataUsingRest: About to return UNDEFINED");
        return undefined;
      }
    } catch (err) {
      this.homey.log("dataFetcher.getDataUsingRest: error block");
      this.homey.log(err.message);
      return undefined;
    }
  }

  /**
  * Build the parameters object for fetch using REST 
  * @param    {boolean} authorization query requires an Authorization string
  * @returns  {object}                query parameters name-value pairs object
  */
  buildRestFetchParams(authorization) {
    const params = {
      "method": 'GET',
    };

    if (authorization) {
      params.headers = {
          "Authorization": "Basic " + Utilities.base64Encode(this.apiKey + ":"),
        }
    }

    return params;
  }

  /**
   * Test the validity of the apiKey by trying to get an access token
   * @param   {string} apiKey     apiKey to be tested 
   * @returns {any}               access token string or undefined 
   */
  async testApiKey(apiKey) {
    this._driver.log(`dataFetcher.testApiKey: Starting: apiKey: ${apiKey} : query:`);
    const query = this.getKrakenTokenQuery(apiKey);
    this._driver.log(`${JSON.stringify(query,null,2)}`);
    const result = await this.runGraphQlQuery(query, undefined);
    let token = undefined;
    if (result.data.obtainKrakenToken !== null) {
      token = result.data.obtainKrakenToken.token;
    }
    this._driver.log(`Token: ${token}`);
    return token;
  }

}