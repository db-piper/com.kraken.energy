'use strict';

module.exports = {
  /**
   * Return the GraphQL query string for essential device pairing data
   * @param {string} accountId 
   * @returns {string} Stringified JSON
   */
  getPairingData: (accountId) => {
    return JSON.stringify({
      operationName: "GetPairingData",
      query: `query GetPairingData($accountNumber: String!) {
        account(accountNumber: $accountNumber) {
          billingOptions {
            currentBillingPeriodStartDate
          }
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
        devices(accountNumber: $accountNumber) {
          id
          name
        }
      }`,
      variables: {
        accountNumber: accountId
      }
    });
  },
  /**
   * Return the GraphQL query string for a full Octopus Account Information refresh
   * @param   {string} accountId 
   * @returns {string} Stringified JSON
   */
  getAccountData: (accountId) => {
    return JSON.stringify({
      operationName: "GetAccount",
      query: `query GetAccount($accountNumber: String!) {
        account(accountNumber: $accountNumber) {
          id
          balance
          billingOptions {
            currentBillingPeriodStartDate
          }
          brand
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
                validFrom
                validTo
                tariff {
                  ... on StandardTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    unitRate
                    preVatUnitRate
                  }
                  ... on DayNightTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    dayRate
                    preVatDayRate
                    nightRate
                    preVatNightRate
                  }
                  ... on ThreeRateTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    offPeakRate
                    preVatOffPeakRate
                    nightRate
                    preVatNightRate
                    dayRate
                    preVatDayRate
                  }
                  ... on HalfHourlyTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    unitRates {
                      preVatValue
                      validFrom
                      validTo
                      value
                    }
                  }
                  ... on PrepayTariff {
                    id
                    displayName
                    fullName
                    isExport
                    productCode
                    tariffCode
                    standingCharge
                    preVatStandingCharge
                    unitRate
                    preVatUnitRate
                  }
                }
              }
            }
          }
        }
        devices(accountNumber: $accountNumber) {
          id
          name
          deviceType
          status {
            currentState
            current
          }
        }
      }`,
      variables: {
        accountNumber: accountId,
      }
    });
  },
  /**
   * Generates a complex dispatch and telemetry query
   * @param {string} meterId
   * @param {Array<{label: string, id: string}>} devices - Array of {label, id}
   * @param {string} startTime - ISO string
   * @param {string} endTime - ISO string
   */
  getHighFrequencyData: (meterId, devices, startTime, endTime) => {
    let variableDeclarations = '$meterId: String!, $startTime: DateTime, $endTime: DateTime, $grouping: TelemetryGrouping';

    let queryBody = `
      smartMeterTelemetry(deviceId: $meterId, start: $startTime, end: $endTime, grouping: $grouping) {
        demand
        export
        consumption
        readAt
      }`;

    const variableValues = {
      meterId,
      startTime,
      endTime,
      grouping: 'ONE_MINUTE'
    };

    // Dynamically append device dispatches
    devices.forEach((device, index) => {
      const varName = `deviceId${String(index).padStart(2, '0')}`;
      variableDeclarations += `, $${varName}: String!`;
      variableValues[varName] = device.id;

      queryBody += `
      ${device.label}: flexPlannedDispatches(deviceId: $${varName}) {
        type
        start
        end
        energyAddedKwh
      }`;
    });

    return JSON.stringify({
      operationName: 'getHighFrequencyData',
      query: `query getHighFrequencyData(${variableDeclarations}) { ${queryBody} }`,
      variables: variableValues
    });
  }
};