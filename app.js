'use strict';
const { TokenSetting, TokenExpirySetting, ApiKeySetting, AccountIdSetting, EventTime, SlotEndTime, PeriodStartDay, DeviceSettingNames } = require('./modules/constants');
const Homey = require('homey');

module.exports = class krakenApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.homey.log('krakenApp.onInit: App Initialization Started');

    this.registerConditionCardListener('slot_relative_price', 'getCurrentlyCheaper');
    this.registerConditionCardListener('price_less_than_tariff', 'getPriceLessThanTariff');

    this.homey.log('krakenApp.onInit: App Initialization Completed');
  }

  /**
   * onUninit is called when the app is terminating.
   */
  async onUninit() {
    this.homey.log('krakenApp.onUninit: App has been terminated');
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
   * Set the most recently executed event time
   * @param {number} milliseconds The event time in epoch milliseconds
   */
  set eventTime(milliseconds) {
    this.homey.settings.set(EventTime, milliseconds);
    this.homey.log(`krakenApp.setEventTime: eventTime ${milliseconds}`);
  }

  /**
   * Return the most recently executed event time
   * @returns {number}  Event time in epoch milliseconds
   */
  get eventTime() {
    return this.homey.settings.get(EventTime);
  }

  /**
   * Calculate the interval in minutes (and decimals) between the current event and the last event
   * @param 	{number} eventMillis	Time of the current event in epoch milliseconds 
   * @returns {number} 					  	Minutes between eventTime and the last event time				
   */
  getEventIntervalMinutes(eventMillis) {
    let lastEventTime = this.homey.settings.get(EventTime);
    this.homey.log(`krakenApp.getEventIntervalMinutes: lastEventTime ${lastEventTime}`);
    if (!lastEventTime) {
      lastEventTime = eventMillis - 60000;
      this.eventTime = lastEventTime;
    }
    const interval = (eventMillis - lastEventTime) / 60000;
    this.homey.log(`krakenApp.getEventIntervalMinutes: interval ${interval} minutes.`);
    return interval;
  }

  /**
   * Set the slot end time of the slot just processed by an event
   * @param {number} milliseconds The slot end time in epoch milliseconds
   */
  set slotEndTime(milliseconds) {
    this.homey.log(`krakenApp.setSlotEndTime: milliseconds ${milliseconds} datetime ${(new Date(milliseconds)).toISOString()}`);
    this.homey.settings.set(SlotEndTime, milliseconds);
  }

  /**
   * Return the slot end time of the slot processed by the most recent event
   * @returns {number}  Slot end time in epoch milliseconds
   */
  get slotEndTime() {
    return this.homey.settings.get(SlotEndTime);
  }

  /**
   * Set the period start day
   * @param {number} day The period start day
   */
  set periodStartDay(day) {
    this.homey.settings.set(PeriodStartDay, day);
  }

  /**
   * Return the period start day
   * @returns {number}  The period start day number
   */
  get periodStartDay() {
    const globalDay = this.homey.settings.get(PeriodStartDay);
    if (globalDay !== undefined && globalDay !== null) {
      return globalDay;
    }
    const driver = this.homey.drivers.getDriver('krakendevicedriver');
    const devices = driver.getDevices();
    if (devices && devices.length > 0) {
      const scavengedDay = devices[0].getSetting(PeriodStartDay);
      this.homey.settings.set(PeriodStartDay, scavengedDay);
      return scavengedDay;
    }
  }

}
