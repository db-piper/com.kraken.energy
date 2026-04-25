'use strict';
const dayjs = require('../bundles/dayjs-bundled/index.js');

let TestData = null;
try {
  TestData = require('../test_data');
} catch {
  // TestData remains null in production
}

/**
 * Translate the device status to a human readable string
 * @param   {string}        status    Device status
 * @returns {string}                  Human readable string or null if no translation available
*/
function translateDeviceStatus(status) {
  let translation = null;
  if (status in DEVICE_STATUS_TRANSLATIONS) {
    translation = DEVICE_STATUS_TRANSLATIONS[status];
  }
  return translation;
}

/**
 * Get the live meter id on the account
 * @param   {object} accountData  Account data from Kraken
 * @returns {string}              Live meter ID
 */
function getLiveMeterId(accountData) {
  let meterId = undefined;
  const account = accountData?.data?.account;
  const agreements = account?.electricityAgreements || [];

  const meter = agreements[0]?.meterPoint?.meters?.find(meter =>
    meter.smartImportElectricityMeter?.deviceId ||
    meter.smartExportElectricityMeter?.deviceId
  );

  if (meter) {
    meterId = meter.smartImportElectricityMeter?.deviceId
      || meter.smartExportElectricityMeter?.deviceId;
  }

  return meterId;
}

/**
 * Return tariff details for the specified direction for the account overview
 * @param   {number}              atTimeMillis  The time in milliseconds to get the prices for
 * @param   {boolean}             isExport      true - export tariff; false - import tariff
 * @param   {object}              accountData   Account data from Kraken
 * @param   {string}              timeZone      The IANA timezone string to use for date calculations
 * @returns {object | undefined}                Tariff details or undefined
 */
function getTariffDirection(atTimeMillis, isExport, accountData, timeZone) {
  let tariff = undefined;
  const agreementsList = accountData?.data?.account?.electricityAgreements;

  if (Array.isArray(agreementsList)) {
    for (const agreementSet of agreementsList) {
      const found = agreementSet.meterPoint?.agreements?.find(
        (a) => a.tariff?.isExport === isExport
      );

      if (found) {
        tariff = found.tariff;
        break;
      }
    }
  }

  if (tariff && tariff.__typename === 'DayNightTariff') {
    tariff.unitRates = getDayNightTariffUnitRates(atTimeMillis, tariff, timeZone);
  } else if (tariff && tariff.__typename === 'ThreeRateTariff') {
    tariff.unitRates = getThreeRateTariffUnitRates(atTimeMillis, tariff, timeZone);
  }

  return tariff;
}

/**
 * Generates a list of unit rates for a Day/Night tariff.
 * @param {number} atTimeMillis  A time within the day for which unit rates are required
 * @param {object} tariff        DayNightTariff data structure from Kraken
 * @param {string} timeZone      The IANA timezone string to use for date calculations
 * @returns {Array<Object>}      Array of unit rates, each with validFrom, validTo, value, and preVatValue
 */
function getDayNightTariffUnitRates(atTimeMillis, tariff, timeZone) {
  const todayLocal = dayjs(atTimeMillis).tz(timeZone).hour(0).minute(0).second(0).millisecond(0);
  const todayZulu = dayjs(atTimeMillis).utc().hour(0).minute(0).second(0).millisecond(0);
  return [
    {
      validFrom: todayLocal.hour(0).toISOString(),
      validTo: todayZulu.hour(0).minute(30).toISOString(),
      value: tariff.dayRate,
      preVatValue: tariff.preVatDayRate
    },
    {
      validFrom: todayZulu.hour(0).minute(30).toISOString(),
      validTo: todayZulu.hour(7).minute(30).toISOString(),
      value: tariff.nightRate,
      preVatValue: tariff.preVatNightRate
    },
    {
      validFrom: todayZulu.hour(7).minute(30).toISOString(),
      validTo: todayLocal.add(1, 'day').hour(0).toISOString(),
      value: tariff.dayRate,
      preVatValue: tariff.preVatDayRate
    },
    {
      validFrom: todayLocal.add(1, 'day').hour(0).toISOString(),
      validTo: todayZulu.add(1, 'day').hour(0).minute(30).toISOString(),
      value: tariff.dayRate,
      preVatValue: tariff.preVatDayRate
    }
  ];
}

/**
 * Generates a list of unit rates for a Three Rate tariff.
 * @param {number} atTimeMillis  A time within the day for which unit rates are required
 * @param {object} tariff        ThreeRateTariff data structure from Kraken
 * @param {string} timeZone      The IANA timezone string to use for date calculations
 * @returns {Array<Object>}      Array of unit rates, each with validFrom, validTo, value, and preVatValue
 */
function getThreeRateTariffUnitRates(atTimeMillis, tariff, timeZone) {
  const todayLocal = dayjs(atTimeMillis).tz(timeZone).hour(0).minute(0).second(0).millisecond(0);
  const todayZulu = dayjs(atTimeMillis).utc().hour(0).minute(0).second(0).millisecond(0);
  return [
    {
      validFrom: todayLocal.hour(0).toISOString(),
      validTo: todayZulu.hour(0).minute(30).toISOString(),
      value: tariff.offPeakRate,
      preVatValue: tariff.preVatOffPeakRate
    },
    {
      validFrom: todayZulu.hour(0).minute(30).toISOString(),
      validTo: todayZulu.hour(7).minute(30).toISOString(),
      value: tariff.nightRate,
      preVatValue: tariff.preVatNightRate
    },
    {
      validFrom: todayZulu.hour(7).minute(30).toISOString(),
      validTo: todayLocal.hour(16).toISOString(),
      value: tariff.offPeakRate,
      preVatValue: tariff.preVatOffPeakRate
    },
    {
      validFrom: todayLocal.hour(16).toISOString(),
      validTo: todayLocal.hour(19).toISOString(),
      value: tariff.dayRate,
      preVatValue: tariff.preVatDayRate
    },
    {
      validFrom: todayLocal.hour(19).toISOString(),
      validTo: todayLocal.add(1, 'day').hour(0).toISOString(),
      value: tariff.offPeakRate,
      preVatValue: tariff.preVatOffPeakRate
    },
    {
      validFrom: todayLocal.add(1, 'day').hour(0).toISOString(),
      validTo: todayZulu.add(1, 'day').hour(0).minute(30).toISOString(),
      value: tariff.offPeakRate,
      preVatValue: tariff.preVatOffPeakRate
    }
  ];
}

/**
 * Return the prices for a tariff for the timeslot immediately preceding the time specified
 * @param   {number}          atTimeMillis  Event date and time in epoch milliseconds
 * @param   {object - JSON}   tariff        Tariff data structure
 * @param   {string}          timeZone      The IANA timezone string to use for date calculations
 * @returns {object - JSON}   {preVatUnitRate, unitRate, preVatStandingCharge, standingCharge, ...}; undefined if no prices available
 */
function getPrices(atTimeMillis, tariff, timeZone) {
  let prices = undefined;

  if (tariff && tariff.unitRates && tariff.unitRates.length > 0) {
    const selectedRate = tariff.unitRates.find(rate => {
      const start = Date.parse(rate.validFrom);
      const end = Date.parse(rate.validTo);
      return start <= atTimeMillis && end > atTimeMillis;
    });

    if (selectedRate) {
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      const tomorrowMs = dayjs(atTimeMillis).tz(timeZone).add(1, 'day').startOf('day').valueOf();

      // Optimized single-pass loop to find Min/Max for Today
      for (const rate of tariff.unitRates) {
        const rateEndMs = Date.parse(rate.validTo);

        // Match original filter: only consider rates ending before or at start of tomorrow
        if (rateEndMs <= tomorrowMs) {
          if (rate.value < minPrice) minPrice = rate.value;
          if (rate.value > maxPrice) maxPrice = rate.value;
        }
      }

      // Fallback: If no window rates found, use the selectedRate itself
      if (minPrice === Infinity) {
        minPrice = selectedRate.value;
        maxPrice = selectedRate.value;
      }

      const quartileStep = (maxPrice - minPrice) / 4 || 0;

      prices = {
        preVatUnitRate: selectedRate.preVatValue,
        unitRate: selectedRate.value,
        preVatStandingCharge: tariff.preVatStandingCharge,
        standingCharge: tariff.standingCharge,
        nextSlotStart: `${selectedRate.validTo}`,
        thisSlotStart: `${selectedRate.validFrom}`,
        // Calculate quartile: 0 (cheapest) to 3 (most expensive)
        quartile: Math.min(3, Math.floor((selectedRate.value - minPrice) / (quartileStep || 1))),
        isHalfHourly: true
      };
    }
  } else if (tariff) {
    const startTime = dayjs(atTimeMillis).tz(timeZone).startOf('day');

    prices = {
      preVatUnitRate: tariff.preVatUnitRate,
      unitRate: tariff.unitRate,
      preVatStandingCharge: tariff.preVatStandingCharge,
      standingCharge: tariff.standingCharge,
      nextSlotStart: startTime.add(1, 'day').toISOString(),
      thisSlotStart: startTime.toISOString(),
      isHalfHourly: false,
      quartile: null
    };
  }

  return prices;
}

/**
 * Indicate if tomorow's prices are available
 * @param             {number}        atTimeMillis     Time in epoch milliseconds
 * @param             {object}        tariff           The tariff data to check
 * @param             {string}        timeZone         The IANA timezone string to use for date calculations
 * @returns {any}                                      Null if not half-hourly tariff; True if half-hourly and prices present; False otherwise
 */
function hasTomorrowsPricesPresent(atTimeMillis, tariff, timeZone) {
  const tomorrow = dayjs(atTimeMillis).tz(timeZone).add(1, 'day').valueOf();
  const nextDayPrices = getPrices(tomorrow, tariff, timeZone);
  return (nextDayPrices === undefined) ? false : (nextDayPrices?.isHalfHourly === true) ? true : null;
}

/**
 * Return the minimum price for the tariff for the day
 * @param   {number}    atTimeMillis      Time to check against in epoch milliseconds
 * @param   {object}    tariffDefinition  The tariff definition
 * @param   {string}    timeZone          The IANA timezone string to use for date calculations
 * @returns {float}                       The minimum price for the day
 */
function minimumTariffPrice(atTimeMillis, tariffDefinition, timeZone) {
  let minimumPrice = 0;

  if (!tariffDefinition) return undefined;

  if (Array.isArray(tariffDefinition.unitRates)) {

    const boundaryMs = dayjs(atTimeMillis).tz(timeZone).add(1, 'day').startOf('day').valueOf();
    const validRates = tariffDefinition.unitRates
      .filter(rate => Date.parse(rate.validFrom) < boundaryMs)
      .map(rate => rate.value);

    if (validRates.length > 0) {
      minimumPrice = Math.min(...validRates);
    }
  } else if ('nightRate' in tariffDefinition) {
    minimumPrice = tariffDefinition.nightRate;
  } else {
    minimumPrice = tariffDefinition.unitRate || 0;
  }

  return minimumPrice;
}

/**
 * Return the maximum price for the tariff for the day
 * @param   {number}    atTimeMillis      Time to check against in epoch milliseconds
 * @param   {object}    tariffDefinition  The tariff definition
 * @param   {string}    timeZone          The IANA timezone string to use for date calculations
 * @returns {float}                       The maximum price for the day
 */
function maximumTariffPrice(atTimeMillis, tariffDefinition, timeZone) {
  let maximumPrice = 0;

  if (!tariffDefinition) return undefined;

  if (Array.isArray(tariffDefinition.unitRates)) {

    const boundaryMs = dayjs(atTimeMillis).tz(timeZone).add(1, 'day').startOf('day').valueOf();
    const validRates = tariffDefinition.unitRates
      .filter(rate => Date.parse(rate.validFrom) < boundaryMs)
      .map(rate => rate.value);

    if (validRates.length > 0) {
      maximumPrice = Math.max(...validRates);
    }
  } else if ('dayRate' in tariffDefinition) {
    maximumPrice = tariffDefinition.dayRate;
  } else {
    maximumPrice = tariffDefinition.unitRate || 0;
  }

  return maximumPrice;
}

const DEVICE_STATUS_TRANSLATIONS = {
  SMART_CONTROL_NOT_AVAILABLE: `Device Unavailable`,
  SMART_CONTROL_CAPABLE: `Nothing Planned`,
  SMART_CONTROL_IN_PROGRESS: `Being Controlled`,
  BOOSTING: `Device Boosting`,
  SMART_CONTROL_OFF: `Smart Control Off`,
  LOST_CONNECTION: `Device Connection Lost`
};
const DEVICE_DISPATCHABLE_STATUSES = ["SMART_CONTROL_CAPABLE", "SMART_CONTROL_IN_PROGRESS", "BOOSTING"];

module.exports = class dataExtractor {
  constructor() {
  }

  /**
   * Extract simple device definitions from the devices array
   * @param   {object}              devices     devices data from Kraken
   * @returns {object | undefined}              set of extracted device definitions
   */
  static extractDeviceData(devices) {
    if (!devices || !Array.isArray(devices)) return undefined;
    const deviceExtracts = {};
    for (const device of devices) {
      const deviceExtract = {};
      deviceExtract.id = `${device.id}`;
      deviceExtract.hashDeviceId = this.hashDeviceId(deviceExtract.id);
      deviceExtract.name = `${device.name}`;
      deviceExtract.currentState = `${device.status?.currentState || ''}`;
      deviceExtract.currentStateTitle = translateDeviceStatus(deviceExtract.currentState);
      deviceExtracts[deviceExtract.hashDeviceId] = deviceExtract;
    }
    return deviceExtracts;
  }

  /**
   * Extract simple account data from the account object
   * @param   {object}               accountData account data from Kraken
   * @returns {object | undefined}               extracted account data
   */
  static extractAccountData(accountData) {
    const account = accountData?.data?.account;
    const accountExtract = (account) ? {} : undefined;
    if (account) {
      accountExtract.balance = account.balance;                                                             //number, pence
      accountExtract.billingStartDate = `${account?.billingOptions?.currentBillingPeriodStartDate || ''}`;  //string, YYYY-MM-DD
      accountExtract.liveMeterId = `${getLiveMeterId(accountData) || ''}`;                             //string
    }
    return accountExtract;
  }

  /**
   * From the mass of accountData abstract the key data items required by the homey devices
   * @param   {number}               atTimeMillis  The time in milliseconds to get the prices for
   * @param   {boolean}              isExport      True iff the required tariff is for export, false iff for import
   * @param   {object}               accountData   The account data from Kraken
   * @param   {string}               timeZone      The IANA timezone string to use for date calculations
   * @returns {object | undefined}                 The extracted account data
   */
  static extractTariffData(atTimeMillis, isExport, accountData, timeZone) {
    const tariffDefinition = getTariffDirection(atTimeMillis, isExport, accountData, timeZone);
    if (!tariffDefinition) return { present: false };

    const pricesNow = getPrices(atTimeMillis, tariffDefinition, timeZone);
    // Use a clean local variable for calculations
    const slotEndStr = `${pricesNow.nextSlotStart || ''}`;
    const slotEndMs = Date.parse(slotEndStr);
    const pricesNext = getPrices(slotEndMs, tariffDefinition, timeZone);

    return {
      present: true,
      productCode: `${tariffDefinition.productCode}`,
      tariffCode: `${tariffDefinition.tariffCode}`,
      isExport: !!isExport,
      //isHalfHourly: tariffDefinition.__typename === 'HalfHourlyTariff',
      isHalfHourly: ['HalfHourlyTariff', 'DayNightTariff', 'ThreeRateTariff'].includes(tariff.__typename),

      // Ensure these return primitives only:
      hasTomorrowsPrices: !!hasTomorrowsPricesPresent(atTimeMillis, tariffDefinition, timeZone),
      unitRate: pricesNow.unitRate,
      preVatUnitRate: pricesNow.preVatUnitRate,
      standingCharge: pricesNow.standingCharge,
      taxRate: 100 * (pricesNow.unitRate - pricesNow.preVatUnitRate) / pricesNow.preVatUnitRate,
      minimumPriceToday: minimumTariffPrice(atTimeMillis, tariffDefinition, timeZone),
      maximumPriceToday: maximumTariffPrice(atTimeMillis, tariffDefinition, timeZone),
      slotStart: `${pricesNow.thisSlotStart}`,
      slotStartShort: dayjs(pricesNow.thisSlotStart).tz(timeZone).format('DD/MM HH:mm'),
      slotEnd: slotEndStr,
      slotEndShort: dayjs(slotEndMs).tz(timeZone).format('DD/MM HH:mm'),
      slotQuartile: pricesNow.quartile,
      nextUnitPrice: pricesNext?.unitRate ?? null,
      nextSlotEnd: pricesNext ? `${pricesNext.nextSlotStart}` : null,
      nextSlotEndShort: pricesNext ? dayjs(pricesNext.nextSlotStart).tz(timeZone).format('DD/MM HH:mm') : null,
      nextSlotQuartile: pricesNext?.quartile ?? null
    };
  }

  /**
   * Surgical extraction of account/device definitions from raw pairing data
   * @param   {object}    rawPairingData      pairing data from Kraken
   * @param   {string}    accountId           The account ID
   * @returns {object[]}                      array of extracted kraken device definitions
   */
  static extractDeviceDefinitions(rawPairingData, accountId, timeZone) {
    if (!getLiveMeterId(rawPairingData)) {
      return [];
    }

    const account = rawPairingData?.data?.account;

    // Preferred TestData formulation
    const rawDevices = (!TestData) ? (rawPairingData?.data?.devices || []) : TestData.getMockDevices();

    const validStatusCodes = Object.keys(DEVICE_STATUS_TRANSLATIONS);
    const dispatchableDevices = rawDevices.filter(device =>
      validStatusCodes.includes(device.status?.currentState)
    );
    const isDispatchable = dispatchableDevices.length > 0;

    const hasExportTariff = account?.electricityAgreements?.some(agreement =>
      agreement.meterPoint?.agreements?.[0]?.tariff?.isExport === true
    ) || false;

    const hasImportTariff = account?.electricityAgreements?.some(agreement =>
      agreement.meterPoint?.agreements?.[0]?.tariff?.isExport === false
    ) || false;

    const billingDate = account?.billingOptions?.currentBillingPeriodStartDate;
    let periodStartDay = 1;
    if (billingDate) {
      periodStartDay = dayjs(billingDate).tz(timeZone).subtract(1, 'day').date();
    }

    const definitions = [];

    // 1. Process Tariffs
    if (account?.electricityAgreements) {
      for (const agreement of account.electricityAgreements) {
        const tariff = agreement.meterPoint?.agreements?.[0]?.tariff;
        if (!tariff) continue;

        const direction = tariff.isExport ? "Export" : "Import";
        const isHalfHourly = ['HalfHourlyTariff', 'DayNightTariff', 'ThreeRateTariff'].includes(tariff.__typename);

        definitions.push({
          name: `${direction} Tariff`,
          data: { id: `${accountId} ${direction}` },
          settings: { periodStartDay },
          store: {
            octopusClass: "octopusTariff",
            isExport: !!tariff.isExport,
            isHalfHourly: isHalfHourly,
            isDispatchable: isDispatchable && isHalfHourly && !tariff.isExport
          },
          icon: `/${direction.toLowerCase()}.svg`
        });
      }
    }

    // 2. Add Account Definition
    definitions.push({
      name: "Octopus Account",
      data: { id: `${accountId} Octopus Account` },
      settings: { periodStartDay },
      store: {
        octopusClass: "octopusAccount",
        hasExport: hasExportTariff,
        hasImport: hasImportTariff
      },
      icon: "/account.svg"
    });

    // 3. Add Device Definitions
    for (const device of dispatchableDevices) {
      definitions.push({
        name: `${device.name || "Unknown Device"}`,
        data: { id: `${device.id}` },
        settings: { periodStartDay },
        store: {
          octopusClass: "smartDevice",
          deviceId: `${device.id}`
        },
        icon: "/device.svg"
      });
    }

    return definitions; // clean result - pairingBlob is now eligible for GC
  }

  /**
   * Extract the live meter reading from the GraphQL query result data
   * @param   {object}    queryData    The raw GraphQL query result data
   * @returns {object}                 The live meter reading
   */
  static extractLiveReading(queryData) {
    const reading = queryData?.data?.smartMeterTelemetry?.[0];
    if (!reading) return undefined;

    return {
      demand: Number(reading.demand),             //Current energy w (positive import, negative export)
      export: Number(reading.export),             //Current export meter reading kWh since meter installed
      consumption: Number(reading.consumption),   //Current import meter reading kWh since meter installed
      readAt: `${reading.readAt}`                 //ISO Date Time string
    };
  }

  /**
   * Iterates through devices and extracts atomized dispatch arrays, 
   * filtered by the current operational state of the Homey devices.
   * @param {object}   rawPayload        - The raw Kraken API response.
   * @param {object[]} deviceStates      - Array of {deviceId, deviceState, title}.
   * @param {string}   timeZone          - The IANA timezone string to use for date calculations
   * @returns {object}                   - Keyed map of valid dispatches.
   */
  static extractAllDeviceDispatches(rawPayload, deviceStates, timeZone) {
    const dispatchMap = {};
    for (const { id, currentState } of deviceStates) {
      // 1. Filter Check: Is this device in a state allowed to receive dispatch minutes?
      if (!DEVICE_DISPATCHABLE_STATUSES.includes(currentState)) {
        continue;
      }

      const deviceKey = this.hashDeviceId(id);

      // 2. Selection logic
      const source = (!TestData)
        ? rawPayload?.data?.[deviceKey]
        : TestData.getMockDispatches(timeZone)?.[deviceKey];

      if (Array.isArray(source)) {
        // 3. Transform and Map
        dispatchMap[deviceKey] = source.map(dispatch => ({
          start: `${dispatch.start}`,
          end: `${dispatch.end}`,
          energyAddedKwh: Number(dispatch.energyAddedKwh),
          type: `${dispatch.type || ''}`
        }));
      }
    }

    return dispatchMap;
  }

  /**
   * Extract device statuses into a clean, UI-ready array
   * @param   {object[]}  rawDevices   Devices array from query result data
   * @param   {string[]}  deviceIds    The IDs we are interested in
   * @returns {object[]}               Array of {id, status, statusTitle}
   */
  static extractDeviceStatuses(rawDevices, deviceIds) {
    return rawDevices
      .filter(device => deviceIds.includes(device.id))
      .map(device => {
        const rawStatus = device.status?.currentState || 'UNKNOWN';
        return {
          id: device.id,
          currentState: rawStatus,
          currentStateTitle: DEVICE_STATUS_TRANSLATIONS[rawStatus] || 'Unknown Status'
        };
      });
  }

  /**
   * Hash a deviceId into a valid GQL query label
   * @param   {string}    deviceId    DeviceId to be hashed
   * @returns {string}                Hashed deviceId usable as a GQL query label
   */
  static hashDeviceId(deviceId) {
    return `d${deviceId.replaceAll("-", "_")}`;
  }

}