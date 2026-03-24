const PeriodStartDay = "periodStartDay";

module.exports = {
  AccountIdSetting: "krakenAccountId",
  ApiKeySetting: "krakenApiKey",
  TokenSetting: "kraken_token",
  TokenExpirySetting: "kraken_token_expiry",
  EventTime: "kraken_event_time",
  SlotEndTime: "kraken_slot_end_time",
  ExtremePrices: "kraken_extreme_prices",
  PeriodStartDay: PeriodStartDay,
  DeviceSettingNames: [
    PeriodStartDay,
    "dispatchMinutesLimit",
    "krakenPollingInterval"
  ]
}