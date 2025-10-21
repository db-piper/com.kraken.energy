'use strict';

const Homey = require('homey');
const { DateTime } = require('luxon');

module.exports = class krakenDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('krakenDevice:onInit - generic krakenDevice has been initialized');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('krakenDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('krakenDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('krakenDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('krakenDevice has been deleted');
  }

  /**
	 * Update the value of a capability
	 * @param     {string}  capabilityName    The name of the capability to be updated
	 * @param     {any}     newValue          The new value to be given to the capability
	 * @returns   {boolean}                   Indicates the value of the capability has changed 
	 */
	async updateCapabilityValue(capabilityName, newValue) {
		let oldValue = this.getCapabilityValue(capabilityName);
		if (oldValue !== newValue) {
			await this.setCapabilityValue(capabilityName, newValue);
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Update capability options on the named capability of this device
	 * @param			{string}				capabilityName		The name of the capability whose options are to be set
	 * @param			{object}				capabilityOptions	JSON object with capability name, value pairs
	 * @returns		{boolean}													True if the capability is found
	 */
	async updateCapabilityOptions(capabilityName, capabilityOptions) {
		if (this.hasCapability(capabilityName)) {
			await this.setCapabilityOptions(capabilityName, capabilityOptions);
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Define the standard interface for processEvent.
	 * @param     {string}        atTime            String representation of the event time
	 * @param     {boolean}       newDay            Indicates that any newDay processing should occur
	 * @param     {object - JSON} liveMeterReading  SmartMeterTelemetry {demand, export, consumption, readAt} 
	 * @returns   {boolean}                         Indicates if any updates have been made to the device capabilities
	 */
	async processEvent(atTime, newDay, liveMeterReading = undefined) {
		return false;
	}

	/**
	 * Indicate whether the hour has changed between two times
	 * @param     {object - date}   newTime         The later time
	 * @param     {object - date}   oldTime         The earlier time
	 * @returns   {boolean}                         True if the UTC hour of the two datetimes is different
	 */
	hourChange(newTime, oldTime) {
		const hourChange = newTime.getUTCHours()!==oldTime.getUTCHours(); 
		return hourChange;
	}

	/**
	 * Return the prices for the accounts import or export tariff
	 * @param   {string}    atTime        String representation of the event date and time
	 * @param   {boolean}   direction     True: export tariff; False: import tariff
	 * @returns {string}                  JSON tariff price structure
	 */
	async getTariffDirectionPrices(atTime, direction) {
		const tariff = await this.driver.managerEvent.accountWrapper.getTariffDirection(direction);
		// this.homey.log(`krakenDevice.getTariffDirectionPrices: tariff: ${JSON.stringify(tariff)}`);
		if (tariff !== undefined) {
			const prices = await this.driver.managerEvent.accountWrapper.getPrices(atTime, tariff);
			// this.homey.log(`krakenDevice.getTariffDirectionPrices: prices: ${JSON.stringify(prices)}`);
			return prices;
		} else {
			return undefined;
		}
	}

	/**
	 * Return the details of the accounts import or export tariff
	 * @param   {boolean}   direction     True: export tariff; False: import tariff
	 * @returns {string}                  JSON tariff price structure
	 */
	async getTariffDirectionDetail(direction) {
		const tariff = await this.driver.managerEvent.accountWrapper.getTariffDirection(direction);
		this.homey.log(`krakenDevice.getTariffDirectionDetail: Direction ${direction}`);
		return tariff;
	}

	/**
	 * Get date/time in Homey timezone
	 * @param		{Date}				jsDate			JS Date object
	 * @returns {DateTime}								DateTime object in Homey's timezone
	 */
	getLocalDateTime(jsDate) {
		const timeZone = this.homey.clock.getTimezone();
		const dateTime = DateTime.fromJSDate(jsDate).setZone(timeZone);
		return dateTime;
	}

	/**
	 * Indicate whether next day prcies are available
	 * @param		{string}		atTime				DateTime that is sometime "today"
	 * @param		{boolean}		direction			True for export, false for import
	 * @returns {any}											Null if not half-hourly tariff; True if half-hourly and prices present; False otherwise
	 */
	async getTomorrowsPricesPresent(atTime, direction) {
		const nextDay = (this.getLocalDateTime(new Date(atTime))).plus({days: 1});
		const nextDayPrices = await this.getTariffDirectionPrices(nextDay.toISO(),direction);
		this.homey.log(`krakenDevice.getTomorrowsPricesPresent: nextDayPrices ${JSON.stringify(nextDayPrices)}`);
		let present = false;
		if (nextDayPrices === undefined) {
			present = false;
		} else {
			if (('isHalfHourly' in nextDayPrices) && nextDayPrices.isHalfHourly) {
				present = true;
			} else {
				present = null;
			}
 		}

		return present;
	}

};
