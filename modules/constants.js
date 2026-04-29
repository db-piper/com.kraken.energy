const PeriodStartDay = "periodStartDay";

module.exports = {
  AccountIdSetting: "krakenAccountId",
  ApiKeySetting: "krakenApiKey",
  TokenSetting: "kraken_token",
  TokenExpirySetting: "kraken_token_expiry",
  EventTime: "kraken_event_time",
  ImportTariff: "kraken_import_tariff",
  ExportTariff: "kraken_export_tariff",
  LiveMeterId: "kraken_live_meter_id",
  DeviceIds: "kraken_device_ids",
  PeriodStartDay: PeriodStartDay,
  DeviceSettingNames: [
    PeriodStartDay,
    "dispatchMinutesLimit",
    "krakenPollingInterval"
  ],
  TriggerFlowCardState: 'triggerFlowCardState'
}