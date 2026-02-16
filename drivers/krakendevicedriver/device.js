'use strict';

const Homey = require('homey');
const { DateTime } = require('../../bundles/luxon');
const krakenAccountWrapper = require('../../modules/krakenAccountWrapper');

module.exports = class krakenDevice extends Homey.Device {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('krakenDevice:onInit - generic krakenDevice has been initialized');
		this._requiredCapabilities = new Map();
		this._updatedCapabilities = new Map();
		this._storeValues = {};
		this._settings = await this.getSettings();
		this.log(`krakenDevice Device:onInit - DeviceSettings: ${JSON.stringify(this._settings)}`);

		if (this._settings.periodStartDay == 0) {
			const periodStartDay = this.accountWrapper.getBillingPeriodStartDay();
			this._settings.periodStartDay = (Number.isFinite(periodStartDay)) ? periodStartDay : 1;
			await this.setSettings(this._settings);
		}
	}

	/**
	 * onAdded is called when the user adds the device, called just after pairing.
	 */
	async onAdded() {
		this.log('krakenDevice:onAdded - generic krakenDevice has been added');
	}

	/**
	 * onSettings is called when the user updates the device's settings.
	 * @param 	{object} 		event 				The onSettings event data
	 * @param 	{object} 		event.oldSettings 	The old settings object
	 * @param 	{object} 		event.newSettings 	The new settings object
	 * @param 	{string[]} 		event.changedKeys 	An array of keys changed since the previous version
	 * @returns {Promise<string|void>} 				return a custom message that will be displayed
	 */
	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.log(`krakenDevice:onSettings settings were changed: ${JSON.stringify(newSettings)}`);
		for (const device of this.driver.getDevices()) {
			if (!Object.is(device, this)) {
				this.homey.log(`krakenDevice:onSettings - updating settings for device: ${device.getName()}`);
				await device.setSettings(newSettings);
			}
			await device.onSettingsChanged({ oldSettings, newSettings, changedKeys })
		}
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
		this.log(`krakenDevice Device:onSettingsChanged - settings changes completed ${this.getName()}.`);
		this._settings = newSettings;
	}


	/**
	 * onRenamed is called when the user updates the device's name.
	 * This method can be used this to synchronise the name to the device.
	 * @param {string} name The new name
	 */
	async onRenamed(name) {
		this.log('krakenDevice:onRenamed was renamed');
	}

	/**
	 * onDeleted is called when the user deleted the device.
	 */
	async onDeleted() {
		this.log('krakenDevice:onDeleted has been deleted');
	}

	/**
	 * Set the device settings values
	 * @param {object} settings 
	 */
	async setSettings(settings) {
		this.log(`krakenDevice Device:setSettings - device ${this.getName()} settings: ${JSON.stringify(settings)}`);
		await super.setSettings(settings);
		this._settings = settings;
	}

	/**
	 * Get the current dispatch for a given time from the array of planned dispatches for all devices
	 * @param 	{string} atTime 			String representation of the event time
	 * @param 	{object} plannedDispatches 	JSON object containing planned dispatches for all devices
	 * @returns {object} 					Current dispatch or undefined if no dispatch currently active
	 */
	getCurrentDispatch(atTime, plannedDispatches) {
		let dispatches = [];
		for (const deviceHash of Object.keys(plannedDispatches)) {
			for (const dispatch of plannedDispatches[deviceHash]) {
				dispatches.push(dispatch);
			}
		}
		const currentDispatch = this.accountWrapper.currentExtendedDispatch(atTime, dispatches);
		return currentDispatch;
	}

	/**
	 * Calculate the total dispatch minutes for all smart devices
	 * @param 	{string} capabilityName 	Name of the capability storing dispatch minutes
	 * @returns {number} 					Total dispatch minutes for all smart devices
	 */
	getTotalDispatchMinutes(capabilityName) {
		let totalDispatchMinutes = 0;
		for (const device of this.driver.getDevices()) {
			if (device.getStoreValue("octopusClass") == "smartDevice") {
				totalDispatchMinutes += device.getCapabilityValue(capabilityName);
			}
		}
		return totalDispatchMinutes;
	}

	/**
	 * Queue the update of the value of the named capability
	 * @param {string} 	capabilityName 		Name of the capability to be updated
	 * @param {any} 		newValue 					New value to be assigned to the capability
	 */
	updateCapability(capabilityName, newValue) {
		if (this.hasCapability(capabilityName)) {
			if (!this.hasOwnProperty("_updatedCapabilities")) {
				this._updatedCapabilities = new Map();
			}
			const safeValue = (typeof newValue === 'object' && newValue !== null)
				? JSON.parse(JSON.stringify(newValue))
				: newValue;
			this._updatedCapabilities.set(capabilityName, safeValue);
		}
	}

	/**
	 * Perform the queued updates to capability values
	 * @param 	{boolean}		updates		True iff any preceding capability has been updated
	 * @returns {Promise<boolean>}			True iff this or any preceding capability has its value changed
	 */
	async updateCapabilities(updates) {
		this.log(`krakenDevice.updateCapabilities: starting`);
		if (!this.hasOwnProperty("_updatedCapabilities")) {
			this.log(`krakenDevice.updateCapabilities: _updatedCapabilities not found`);
			this._updatedCapabilities = new Map();
		}
		const updatedCapabilitiesNames = Array.from(this._updatedCapabilities.keys());
		let updated = updates;
		for (const capabilityName of updatedCapabilitiesNames) {
			const value = this._updatedCapabilities.get(capabilityName);
			updated = (await this.updateCapabilityValue(capabilityName, value)) || updated;
		}
		this._updatedCapabilities = new Map();
		return updated;
	}

	/**
	 * Tolerant update of a capability value
	 * @param     {string}  capabilityName    The name of the capability to be updated
	 * @param     {any}     newValue          The new value to be given to the capability
	 * @returns   {boolean}                   Indicates the value of the capability has changed
	 */
	async updateCapabilityValue(capabilityName, newValue) {
		let updated = false;
		if (this.hasCapability(capabilityName)) {
			let oldValue = this.getCapabilityValue(capabilityName);
			if (oldValue !== newValue) {
				this.homey.log(`krakenDevice.updateCapabilityValue: Update ${capabilityName} with ${newValue} from ${oldValue}`);
				await this.setCapabilityValue(capabilityName, newValue);
				updated = true;
			}
		} else {
			this.homey.log(`device.updateCapabilityValue: Capability not found ${capabilityName}`);
		}
		return updated;
	}

	/**
	 * Define the standard interface for processEvent.
	 * @param     {string}        atTime            String representation of the event time
	 * @param     {boolean}       newDay            Indicates that any newDay processing should occur
	 * @param     {object - JSON} liveMeterReading  SmartMeterTelemetry {demand, export, consumption, readAt}
	 * @returns   {Promise<boolean>}                Indicates if any updates are queued to the device capabilities
	 */
	processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = {}) {
		return false;
	}

	/**
	 * Commit changes to the capabilities of the device from the temporary storage map
	 * @returns {Promise<boolean>}									Indicates if any updates have been committed
	 */
	async commitCapabilities() {
		return await this.updateCapabilities();
	}

	/**
	 * Return the app's current instance of krakenAccountWrapper
	 * @returns		{krakenAccountWrapper}		Current app instance of the account wrapper
	 */
	get accountWrapper() {
		return this.driver.managerEvent.accountWrapper;
	}

	/**
	 * Indicate whether the hour has changed between two event times
	 * @param     {jsDate}   	newTime   The later time
	 * @param     {jsDate}   	oldTime   The earlier time
	 * @returns   {boolean}            	True if the UTC hour of the two datetimes is different
	 */
	hourChange(newTime, oldTime) {
		const hourChange = newTime.getUTCHours() !== oldTime.getUTCHours();
		return hourChange;
	}

	/**
	 * Establish a capability definition to be applied to a device
	 * @param {string} 		name				Name of the capability
	 * @param {object} 		overrides 	Object defining capability options to be set
	 * @param {string[]}	force				List of option names to be forced to update
	 */
	defineCapability(name, overrides = {}, force = [], required = true) {
		if (!this.hasOwnProperty("_requiredCapabilities")) {
			this._requiredCapabilities = new Map();
		}
		if (required) {
			this._requiredCapabilities.set(name, { overrides: overrides, force: force });
		}
	}

	/**
	 * Constrain the capabilities of a device to match the required list of capabilities
	 */
	async applyCapabilities() {
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
			if (!(definedCapabilitiesNames.includes(requiredCapabilityName))) {				// Required capability is not defined - add it
				this.homey.log(`krakenDevice.restrictCapabilities: Add capability ${requiredCapabilityName}`);
				await this.addCapability(requiredCapabilityName);
				const capabilityOptions = this._requiredCapabilities.get(requiredCapabilityName).overrides;
				await this.setCapabilityOptions(requiredCapabilityName, capabilityOptions);
				addedCapabilityNames.push(requiredCapabilityName);
			}
		}

		for (const setOptionsName of requiredCapabilitiesNames) {								// Each requiredCapabilityName
			if (!addedCapabilityNames.includes(setOptionsName)) {									//		Not just added - so we are interested in a force list
				const forceNames = this._requiredCapabilities.get(setOptionsName).force;
				if (forceNames.length !== 0) {																//				Capability has a force list
					const overrides = this._requiredCapabilities.get(setOptionsName).overrides;
					let appliedOverrides = {};
					for (const forceName of forceNames) {													//						For each force name
						if (forceName in overrides) {															//								There is an override for this name
							appliedOverrides[forceName] = overrides[forceName];										//								Prepare to apply the override
						}
					}
					if (Object.getOwnPropertyNames(appliedOverrides).length > 0) {	//						There some options being forced
						this.homey.log(`krakenDevice.restrictCapabilities: Change options on ${setOptionsName} overrides ${JSON.stringify(appliedOverrides)}`);
						await this.setCapabilityOptions(setOptionsName, appliedOverrides);
					}
				}
			}
		}

		this._requiredCapabilities = new Map();
	}

	/**
	 * Define a value to be added to the device's store
	 * @param {string} 		name				Name of the value
	 * @param {any} 		value 				Value to be associated with the name
	 */
	defineStoreValue(name, value) {
		if (!this.hasOwnProperty("_storeValues")) {
			this._storeValues = {};
		}
		this._storeValues[name] = value;
	}

	/**
	 * Add defined values to the device's store
	 */
	async applyStoreValues() {
		this.log(`krakenDevice.applyStoreValues: starting`);
		const keys = this.getStoreKeys();
		for (const newKey of Object.keys(this._storeValues)) {
			if (!keys.includes(newKey)) {
				await this.setStoreValue(newKey, this._storeValues[newKey]);
				this.log(`krakenDevice.applyStoreValues: new key ${newKey} value ${this.getStoreValue(newKey)}`);
			}
		}
		this._storeValues = {};
	}

};