'use strict';

const PAIRING_QUERY = `query GetPairingData($accountNumber: String!) {
  account(accountNumber: $accountNumber) {
    billingOptions { currentBillingPeriodStartDate }
    electricityAgreements(active: true) {
      meterPoint {
        agreements(includeInactive: false) {
          tariff {
            __typename
            ... on StandardTariff { isExport }
            ... on DayNightTariff { isExport }
            ... on ThreeRateTariff { isExport }
            ... on HalfHourlyTariff { isExport }
            ... on PrepayTariff { isExport }
          }
        }
      }
    }
  }
  devices(accountNumber: $accountNumber) { id name status { currentState } }
}`;

const ACCOUNT_DATA_QUERY = `query GetAccount($accountNumber: String!) {
  account(accountNumber: $accountNumber) {
    id balance billingOptions { currentBillingPeriodStartDate } brand
    electricityAgreements(active: true) {
      id
      meterPoint {
        mpan
        meters(includeInactive: false) {
          serialNumber
          smartImportElectricityMeter { deviceId }
          smartExportElectricityMeter { deviceId }
        }
        agreements(includeInactive: false) {
          validFrom validTo
          tariff {
            ... on StandardTariff { id displayName fullName isExport productCode tariffCode standingCharge preVatStandingCharge unitRate preVatUnitRate }
            ... on DayNightTariff { id displayName fullName isExport productCode tariffCode standingCharge preVatStandingCharge dayRate preVatDayRate nightRate preVatNightRate }
            ... on ThreeRateTariff { id displayName fullName isExport productCode tariffCode standingCharge preVatStandingCharge offPeakRate preVatOffPeakRate nightRate preVatNightRate dayRate preVatDayRate }
            ... on HalfHourlyTariff { id displayName fullName isExport productCode tariffCode standingCharge preVatStandingCharge unitRates { preVatValue validFrom validTo value } }
            ... on PrepayTariff { id displayName fullName isExport productCode tariffCode standingCharge preVatStandingCharge unitRate preVatUnitRate }
          }
        }
      }
    }
  }
  devices(accountNumber: $accountNumber) { id name deviceType status { currentState current } }
}`;

const KRAKEN_TOKEN_MUTATION = `mutation GetKrakenToken($apikey: String!) {
  obtainKrakenToken(input: {APIKey: $apikey}) { 
    token refreshToken refreshExpiresIn payload 
  }
}`;

module.exports = {
  /**
   * Return the GraphQL query string for essential device pairing data
   * @param   {string} accountId  The account number to be queried
   * @returns {string}            Stringified JSON of the parameterized query
   */
  getPairingData: (accountId) => JSON.stringify({
    operationName: "GetPairingData",
    query: PAIRING_QUERY, // Reference the static constant
    variables: { accountNumber: accountId }
  }),

  /**
   * Return the GraphQL query string for a full Octopus Account Information refresh
   * @param   {string} accountId  The account number to be queried
   * @returns {string}            Stringified JSON of the parameterized query
   */
  getAccountData: (accountId) => JSON.stringify({
    operationName: "GetAccount",
    query: ACCOUNT_DATA_QUERY, // Reference the static constant
    variables: { accountNumber: accountId }
  }),

  /**
   * Return the query string to obtain the Kraken API Token
   * @param   {string} apiKey  the API key to be used to obtain the Kraken API Token
   * @returns {string} Stringified JSON representing the query
   */
  getKrakenTokenQuery: (apiKey) => JSON.stringify({
    operationName: "GetKrakenToken",
    query: KRAKEN_TOKEN_MUTATION,
    variables: { apikey: apiKey }
  }),


  /**
   * Generates a complex dispatch and telemetry query
   * @param   {string}                              meterId          The meter ID to be queried
   * @param   {Array<{label: string, id: string}>}  devices          Array of {label, id}
   * @param   {string}                              startTime        ISO string
   * @param   {string}                              endTime          ISO string
   * @returns {string}                                               Stringified JSON of the parameterized query 
   */
  getHighFrequencyData: (meterId, devices, startTime, endTime) => {
    const varDecls = ['$meterId: String!', '$startTime: DateTime', '$endTime: DateTime', '$grouping: TelemetryGrouping'];
    const queryParts = [`
      smartMeterTelemetry(deviceId: $meterId, start: $startTime, end: $endTime, grouping: $grouping) {
        demand export consumption readAt
      }`];

    const variableValues = { meterId, startTime, endTime, grouping: 'ONE_MINUTE' };

    devices.forEach((device, index) => {
      const varName = `deviceId${String(index).padStart(2, '0')}`;
      varDecls.push(`$${varName}: String!`);
      variableValues[varName] = device.id;

      queryParts.push(`
      ${device.label}: flexPlannedDispatches(deviceId: $${varName}) {
        type start end energyAddedKwh
      }`);
    });

    return JSON.stringify({
      operationName: 'getHighFrequencyData',
      query: `query getHighFrequencyData(${varDecls.join(', ')}) { ${queryParts.join(' ')} }`,
      variables: variableValues
    });
  }
}