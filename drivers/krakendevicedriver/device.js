'use strict';

const Homey = require('homey');
const { DateTime } = require('luxon');

module.exports = class krakenDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('krakenDevice:onInit - generic krakenDevice has been initialized');
		this._requiredCapabilities = new Map();
		this._storeValues = {};
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('krakenDevice:onAdded - generic karkenDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param 	{object} 		event 						The onSettings event data
   * @param 	{object} 		event.oldSettings The old settings object
   * @param 	{object} 		event.newSettings The new settings object
   * @param 	{string[]} 	event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} 				return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('krakenDevice settings were changed');
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
	 * Tolerant update of a capability value
	 * @param     {string}  capabilityName    The name of the capability to be updated
	 * @param     {any}     newValue          The new value to be given to the capability
	 * @returns   {boolean}                   Indicates the value of the capability has changed 
	 */
	async updateCapabilityValue(capabilityName, newValue) {
		if (this.hasCapability(capabilityName)) {
			let oldValue = this.getCapabilityValue(capabilityName);
			if (oldValue !== newValue) {
				await this.setCapabilityValue(capabilityName, newValue);
				return true;
			} else {
				return false;
			}
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
	 * @param     {jsDate}   	newTime    The later time
	 * @param     {jaDate}   	oldTime    The earlier time
	 * @returns   {boolean}            True if the UTC hour of the two datetimes is different
	 */
	hourChange(newTime, oldTime) {
		const hourChange = newTime.getUTCHours()!==oldTime.getUTCHours(); 
		return hourChange;
	}

	/**
	 * Return the prices for the accounts import or export tariff
	 * @param   {string}    atTime        String representation of the event date and time
	 * @param   {boolean}   direction     True: export tariff; False: import tariff
	 * @returns {object}                  JSON tariff price structure
	 */
	async getTariffDirectionPrices(atTime, direction) {
		const tariff = await this.driver.managerEvent.accountWrapper.getTariffDirection(direction);
		if (tariff !== undefined) {
			const prices = await this.driver.managerEvent.accountWrapper.getPrices(atTime, tariff);
			return prices;
		} else {
			return undefined;
		}
	}

	/**
	 * Return the details of the accounts import or export tariff
	 * @param   {boolean}   direction     True: export tariff; False: import tariff
	 * @returns {object}                  JSON tariff price structure
	 */
	async getTariffDirectionDetail(direction) {
		const tariff = await this.driver.managerEvent.accountWrapper.getTariffDirection(direction);
		this.homey.log(`krakenDevice.getTariffDirectionDetail: Direction ${direction}`);
		return tariff;
	}

	/**
	 * Indicate whether a tariff is halfHourly or simple
	 * @param 		{boolean} 		direction		True: export; False: import 
	 * @returns 	{boolean}									True: halfHourly tariff; False: simple tariff
	 */
	async isHalfHourly(direction) {
		const tariff = await this.getTariffDirectionDetail(direction);
		const priceSlots = 'unitRates' in tariff;
		return priceSlots; 
	}

	getDeviceCount() {
		return this.driver.managerEvent.accountWrapper.getDeviceCount();
	}

	getCompletedDispatchesCount() {
		return this.driver.managerEvent.accountWrapper.getCompletedDispatchesCount();
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

	/**
	 * Establish a capability definition to be applied to a device
	 * @param {string} 	name				Name of the capability 
	 * @param {object} 	overrides 	Object defining capability options to be set
	 */
  defineCapability(name, overrides = null) {
		this._requiredCapabilities.set(name, overrides);
	}

	/**
	 * Constrain the capabilities of a device to match the required list of capabilities
	 * @param {boolean}		forceOptions	Capability options will be applied too all capabilities, not just newly added ones 
	 */
	async applyCapabilities(forceOptions) {
		this.homey.log(`krakenDevice.applyCapabilities: starting`);
		const definedCapabilitiesNames = this.getCapabilities();
		const requiredCapabilitiesNames = Array.from(this._requiredCapabilities.keys());
		let addedCapabilityNames = [];
		for (const definedCapabilityName of definedCapabilitiesNames) {
			if (!(requiredCapabilitiesNames.includes(definedCapabilityName))) {				// Defined capability not in required list - remove it
				this.homey.log(`krakenDevice.restrictCapabilities: Remove capability ${definedCapabilityName}`);
				await this.removeCapability(definedCapabilityName);
			}
		}

		for (const requiredCapabilityName of requiredCapabilitiesNames) {
			if (!(definedCapabilitiesNames.includes(requiredCapabilityName))) {		// Required capability is not defined
				this.homey.log(`krakenDevice.restrictCapabilities: Add capability ${requiredCapabilityName}`);
				await this.addCapability(requiredCapabilityName);
				addedCapabilityNames.push(requiredCapabilityName);
			}
		}

		this.ready();
		
		const setOptionsNames = forceOptions ? requiredCapabilitiesNames : addedCapabilityNames;
		for (const setOptionsName of setOptionsNames) {
			const overrides = this._requiredCapabilities.get(setOptionsName);
			if (overrides !== null) {
				await this.setCapabilityOptions(setOptionsName, overrides);
				this.homey.log(`krakenDevice.restrictCapabilities: Change capability options ${setOptionsName} overrides ${JSON.stringify(overrides)}`);
			}				
		}
	}

	defineStoreValue(name, value) {
		this._storeValues[name] = value;
	}

	async applyStoreValues() {
		this.log(`krakenDevice.applyStoreValues: starting`);
		const keys = this.getStoreKeys();
		for (const newKey of Object.keys(this._storeValues)) {
			if (!keys.includes(newKey)) {
				await this.setStoreValue(newKey, this._storeValues[newKey]);
				this.log(`krakenDevice.applyStoreValues: new key ${newKey} value ${this.getStoreValue(newKey)}`);
			}
		}
	}

};
