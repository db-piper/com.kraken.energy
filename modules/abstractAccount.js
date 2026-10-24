'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");
const dayjs = require('../bundles/dayjs-bundled/index.js');

module.exports = class abstractAccount extends krakenDevice {

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    super.onAdded();
    this.log('energyAccount Device:onAdded - has been added');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('energyAccount Device:onRenamed - was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('energyAccount Device:onDeleted - has been deleted');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param 	{object} 		event 				The onSettings event data
   * @param 	{object} 		event.oldSettings 	The old settings object
   * @param 	{object} 		event.newSettings 	The new settings object
   * @param 	{string[]} 		event.changedKeys 	An array of keys changed since the previous version
   * @returns {Promise<string|void>} 				Return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    await super.onSettings({ oldSettings, newSettings, changedKeys });
    this.log('energyAccount Device:onSettings - settings were changed');
  }

  /**
   * onSettingsChanged is called to complete the user's updates to the device's settings.
   * @param  	{object} 			event 				The onSettings event data
   * @param  	{object} 			event.oldSettings 	The old settings object
   * @param  	{object} 			event.newSettings 	The new settings object
   * @param  	{string[]} 			event.changedKeys 	An array of keys changed since the previous version
   * @returns {Promise<string|void>}	Return a custom message that will be displayed
   */
  async onSettingsChanged({ oldSettings, newSettings, changedKeys }) {
    await super.onSettingsChanged({ oldSettings, newSettings, changedKeys });
    if (changedKeys.includes('periodStartDay')) {
      this.homey.log(`energyAccount Device:onSettingsChanged - periodStartDay changed to ${newSettings.periodStartDay}`);
      await this.updatePeriodDay(newSettings.periodStartDay);
    }
    this.log('energyAccount Device:onSettingsChanged - settings changes completed.');
  }

  /**
   * For a given date compute the number of the day in the period
   * @param   {number}    atTimeMillis      Date in epoch milliseconds to compute the period day for
   * @param   {integer}   periodStartDay    The day in month when the period starts
   * @returns {integer}                     The 1-based index into the period of the date
   */
  computePeriodDay(atTimeMillis, periodStartDay) {
    const eventDateTime = dayjs(atTimeMillis).tz(this.wrapper.timeZone).startOf('day');
    const periodStartDate = this.computePeriodStartDate(atTimeMillis, periodStartDay);
    const periodDay = 1 + eventDateTime.diff(periodStartDate, 'days');
    return periodDay;
  }

  /**
   * Compute the start date of the period
   * @param   {number}    atTimeMillis      Event time in milliseconds since the epoch
   * @param   {integer}   periodStartDay    The day in month when the period starts
   * @returns {dayjs}                     The start date of the period
   */
  computePeriodStartDate(atTimeMillis, periodStartDay) {
    const eventDateTime = dayjs(atTimeMillis).tz(this.wrapper.timeZone).startOf('day');
    const currentDay = eventDateTime.date();
    const periodStartDate = (currentDay < periodStartDay) ?
      eventDateTime.subtract(1, 'month').date(Number(periodStartDay)) :
      eventDateTime.date(Number(periodStartDay));
    this.log(`energyAccount.computePeriodStartDate: periodStartDate ${periodStartDate.toISOString()}`)
    return periodStartDate;
  }

  /**
   * Compute the length of the period that includes the specified date in days
   * @param   {number}    atTimeMillis      Datetime in milliseconds since the epoch to be included in the period
   * @param   {integer}   periodStartDay    The day in month when the period starts
   * @returns {integer}                     The length of the period
   */
  computePeriodLength(atTimeMillis, periodStartDay) {
    const periodStartDate = this.computePeriodStartDate(atTimeMillis, periodStartDay);
    const periodEndDate = periodStartDate.add(1, 'month');
    const length = periodEndDate.diff(periodStartDate, 'days');
    this.homey.log(`energyAccount.computePeriodLength: periodLength ${length}`);
    return length;
  }

}
