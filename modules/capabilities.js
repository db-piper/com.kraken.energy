/**
 * lib/capabilities.js
 * The Single Source of Truth for all Homey Capability IDs.
 */

const COMMON = {
};

const PRODUCT_TARIFF = {
  PRODUCT_CODE: "product_code",
  TARIFF_CODE: "tariff_code",
  UNIT_PRICE_PAID: "measure_monetary.unit_price_taxed",
  STANDING_CHARGE: "measure_monetary.standing_charge_taxed",
  METER_READING: "meter_power",
  SLOT_ENERGY_CONSUMPTION: "meter_power.consumption",
  SLOT_ENERGY_VALUE: "measure_monetary.energy_value_taxed",
  AVERAGE_POWER: "measure_power.average",
  SLOT_QUARTILE: "slot_quartile",
  TAX_RATE: "percent.tax_rate",
  SLOT_START_TIME: "date_time.slot_start",
  SLOT_END_TIME: "date_time.slot_end",
  NEXT_UNIT_PRICE: "measure_monetary.next_unit_price_taxed",
  NEXT_SLOT_QUARTILE: "slot_quartile.next_slot_quartile",
  NEXT_DAY_PRICES_INDICATOR: "data_presence.next_day_prices",
  NEXT_SLOT_END_TIME: "date_time.next_slot_end",
  DISPATCH_PRICING_INDICATOR: "data_presence.dispatch_pricing",
  UNIT_PRICE_TARIFF: "measure_monetary.unit_price_tariff",
  DISPATCH_LIMIT_PERCENT: "percent.dispatch_limit",
  SLOT_START_DATETIME: "date_time.full_slot_start",
  SLOT_END_DATETIME: "date_time.full_slot_end",
};

const ENERGY_ACCOUNT = {
  PERIOD_START_TEXT: "date_time.period_start",
  PERIOD_NEXT_START_TEXT: "date_time.next_period_start",
  PERIOD_DAY_NUMBER: "period_day.period_day",
  PERIOD_DURATION: "period_day.period_duration",
  ACCOUNT_BALANCE: "measure_monetary.account_balance",
  PROJECTED_BILL: "measure_monetary.projected_bill",
  IMPORT_READING: "meter_power.import",
  EXPORT_READING: "meter_power.export",
  PERIOD_IMPORT_ENERGY: "meter_power.period_import",
  PERIOD_EXPORT_ENERGY: "meter_power.period_export",
  PERIOD_IMPORT_VALUE: "measure_monetary.period_import_value",
  PERIOD_EXPORT_VALUE: "measure_monetary.period_export_value",
  PERIOD_STANDING_CHARGE: "measure_monetary.period_standing_charge",
  PERIOD_BILL: "measure_monetary.period_bill",
  DAY_IMPORT_ENERGY: "meter_power.day_import",
  DAY_EXPORT_ENERGY: "meter_power.day_export",
  DAY_IMPORT_VALUE: "measure_monetary.day_import_value",
  DAY_EXPORT_VALUE: "measure_monetary.day_export_value",
  CHUNK_IMPORT_ENERGY: "meter_power.chunk_import",
  CHUNK_EXPORT_ENERGY: "meter_power.chunk_export",
  CHUNK_IMPORT_VALUE: "measure_monetary.chunk_import_value",
  CHUNK_EXPORT_VALUE: "measure_monetary.chunk_export_value",
  CURRENT_IMPORT_POWER: "measure_power.import_power",
  CURRENT_EXPORT_POWER: "measure_power.export_power",
  PERIOD_START_DATETIME: "date_time.full_period_start",
  PERIOD_NEXT_START_DATETIME: "date_time.full_next_period",
  OBSERVED_DAYS: "item_count.observed_days",
};

const SMART_ENERGY_DEVICE = {
  DEVICE_NAME: "device_attribute.name",
  DEVICE_STATUS: "device_attribute.status",
  PLANNED_DISPATCHES: "item_count.planned_dispatches",
  IN_DISPATCH: "data_presence.in_dispatch",
  ALARM_POWER: "alarm_power",
  CURRENT_DISPATCH_START: "date_time.current_dispatch_start",
  CURRENT_DISPATCH_END: "date_time.current_dispatch_end",
  REMAINING_DISPATCH_DURATION: "duration.remaining_duration",
  NEXT_DISPATCH_COUNTDOWN: "duration.next_dispatch_countdown",
  NEXT_DISPATCH_START: "date_time.next_dispatch_start",
  DISPATCH_MINUTES: "item_count.dispatch_minutes",
};

// The Registry: Mapping Driver IDs to their specific definitions
const REGISTRY = {
  'octopusTariff': PRODUCT_TARIFF,
  'octopusAccount': ENERGY_ACCOUNT,
  'smartDevice': SMART_ENERGY_DEVICE,
};

module.exports = {
  /**
   * Returns a merged object of common + driver-specific keys
   */
  registryForDriver: (driverId) => {
    return {
      ...COMMON,
      ...(REGISTRY[driverId] || {})
    };
  }
};