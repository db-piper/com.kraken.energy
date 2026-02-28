'use strict';

const Homey = require('homey');
const { DateTime } = require('../../bundles/luxon');
const krakenAccountWrapper = require('../../modules/krakenAccountWrapper');
const Capabilities = require('../../modules/capabilities');

module.exports = class krakenDevice extends Homey.Device {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('krakenDevice:onInit - generic krakenDevice Initialization Started');
		const className = this.getStoreValue('octopusClass');
		this._capabilityIds = Capabilities.registryForDriver(className);
		this._capIds = new Proxy(this._capabilityIds, {
			get(target, prop) {
				if (prop in target) return prop; // Returns the key name as the value
				throw new Error(`[krakenDevice:Proxy] Capability ID "${String(prop)}" is not in the registry for ${className}`);
			}
		});
		const idCount = Object.keys(this._capabilityIds).length;
		this.log(`krakenDevice:onInit ${this.getName()} instance of ${className} with ${idCount} capability ids`);

		this._requiredCapabilities = {};
		this._updatedCapabilities = {};
		this._accountWrapper = this.driver.accountWrapper;
		this._storeValues = {};
		await this.migrateSettings(this.getSettings());
		await this.migrateStore();
		this.log(`krakenDevice Device:onInit - DeviceSettings: ${JSON.stringify(this.getSettings())}`);
		this.log('krakenDevice:onInit - generic krakenDevice Initialization Completed');
		await super.onInit();
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
	 * onUnit is called when the device is destroyed
	 */
	async onUnit() {
		this.log('krakenDevice:onInit - generic krakenDevice UnInitialization Started');
		this._requiredCapabilities = null;
		this._updatedCapabilities = null;
		//this._storeValues = null;
	}

	/**
	 * Ensure the set of settings is complete set default values for any missing setting
	 * @param 	{object} currentSettings	current settings and their values
	 * @returns {promise<object>}					full settings as stored in device.settings
	 */
	async migrateSettings(currentSettings) {
		const defaultSettings = {
			periodStartDay: 1,
			dispatchMinutesLimit: 360,
			krakenPollingInterval: "1"
		}

		const newSettings = {};
		let migrate = false;

		for (const [key, defaultValue] of Object.entries(defaultSettings)) {
			if (typeof currentSettings[key] === 'undefined') {
				newSettings[key] = defaultValue;
				migrate = true;
			}
		}

		if (migrate) {
			this.log(`krakenDevice Device:migrateSettings - migrating settings for device ${this.getName()}.`);
			await this.setSettings(newSettings);
		}

		return this.getSettings();
	}

	/**
	 * Ensure the set of store values is complete for each device; overridden in concrete classes
	 * @returns {promise<void>}
	 */
	async migrateStore() {
		this.log(`krakenDevice Device: migrateStore - migrating settings for device ${this.getName()}.`);
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
	 * @returns {number} 								Total dispatch minutes for all smart devices
	 */
	getTotalDispatchMinutes() {
		//TODO: This created dependency between Homey devices and order of update
		//TODO: Write an algorithm that is {each smartDevice {is in dispatch: add minute}} don't rely on "foreign" homey devices
		//TODO: FREQ 
		let totalDispatchMinutes = 0;
		for (const device of this.driver.getDevices()) {
			if (device.getStoreValue("octopusClass") == "smartDevice") {
				totalDispatchMinutes += device.readCapabilityValue(this._capIds.DISPATCH_MINUTES);
			}
		}
		return totalDispatchMinutes;
	}

	/**
	 * Check if the device has a capability with the given ID
	 * @param  	{string} 	id  ID of the capability to check	
	 * @returns {boolean}			True iff the device has a capability with the given ID
	 */
	hasCapabilityWithId(id) {
		this.homey.log(`krakenDevice.hasCapabilityWithId: id ${id} on ${this.getName()}`);
		return this.hasCapability(this.getCapabilityName(id));
	}

	/**
	 * Queue the update of the value of the named capability
	 * @param {string} 	capabilityId 		ID of the capability to be updated
	 * @param {any} 		newValue 				New value to be assigned to the capability
	 */
	updateCapability(capabilityId, newValue) {
		const capabilityName = this._capabilityIds[capabilityId];
		if (this.hasCapability(capabilityName)) {
			if (!this.hasOwnProperty("_updatedCapabilities")) {
				this._updatedCapabilities = {};
			}
			const safeValue = (typeof newValue === 'object' && newValue !== null)
				? JSON.parse(JSON.stringify(newValue))
				: newValue;
			this._updatedCapabilities[capabilityId] = safeValue;
		}
	}

	/**
	 * Perform the queued updates to capability values
	 * @param 	{boolean}						updates		True iff any preceding capability has been updated
	 * @returns {Promise<boolean>}						True iff this or any preceding capability has its value changed
	 */
	async updateCapabilities(updates = false) {
		this.log(`krakenDevice.updateCapabilities: starting`);
		if (!this.hasOwnProperty("_updatedCapabilities")) {
			this.log(`krakenDevice.updateCapabilities: _updatedCapabilities not found`);
			this._updatedCapabilities = {};
		}
		let updated = updates;
		for (const capabilityId of Object.keys(this._updatedCapabilities)) {
			const capabilityName = this._capabilityIds[capabilityId];
			const value = this._updatedCapabilities[capabilityId];
			updated = (await this.updateCapabilityValue(capabilityName, value)) || updated;
		}
		this._updatedCapabilities = {};																						//IDS - just = {}	
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
				this.homey.log(`krakenDevice.updateCapabilityValue: ${this.getName()}.${capabilityName} from ${oldValue} to ${newValue}`);
				await this.setCapabilityValue(capabilityName, newValue);
				updated = true;
			}
		} else {
			this.homey.log(`krakenDevice.updateCapabilityValue: ${this.getName()}.${capabilityName} not found`);
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
	processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = {}, accountData = undefined) {
		return false;
	}

	/**
	 * Indicate if the device is (still) an available device
	 * @param			{object}				accountData				Current account data from Kraken
	 * @returns		{Promise<boolean>}								Indicates if the device is available
	 */
	async setDeviceAvailability(accountData) {
		return true
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
		return this._accountWrapper;
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
	 * @param {string} 		id					ID of the capability
	 * @param {object} 		overrides 	Object defining capability options to be set
	 * @param {string[]}	force				List of option names to be forced to update
	 * @param {boolean}		required		Indicates if the capability is required
	 */
	defineCapability(id, overrides = {}, force = [], required = true) {
		if (!this.hasOwnProperty("_requiredCapabilities")) {
			this._requiredCapabilities = {};
		}
		if (required) {
			const name = this.getCapabilityName(id);
			this._requiredCapabilities[id] = { name: name, overrides: overrides, force: force };
		}
	}

	/**
	 * Constrain the capabilities of a device to match the required list of capabilities
	 */
	async applyCapabilities() {
		this.homey.log(`krakenDevice.applyCapabilities: starting`);
		const definedCapabilitiesNames = this.getCapabilities();
		const nameToIdMap = Object.fromEntries(
			Object.keys(this._requiredCapabilities).map(id => [this.getCapabilityName(id), id])
		);
		const requiredCapabilitiesNames = Object.keys(nameToIdMap);
		let addedCapabilityNames = [];
		for (const definedCapabilityName of definedCapabilitiesNames) {
			if (!(requiredCapabilitiesNames.includes(definedCapabilityName))) {				// Defined capability not in required list - remove it
				this.homey.log(`krakenDevice.applyCapabilities: ${this.getName()} remove capability id ${nameToIdMap[definedCapabilityName]}`);
				await this.removeCapability(definedCapabilityName);
			}
		}

		for (const requiredCapabilityName of requiredCapabilitiesNames) {
			if (!(definedCapabilitiesNames.includes(requiredCapabilityName))) {				// Required capability is not defined - add it
				this.homey.log(`krakenDevice.applyCapabilities: ${this.getName()} add capability id ${nameToIdMap[requiredCapabilityName]}`);
				await this.addCapability(requiredCapabilityName);
				const capabilityId = nameToIdMap[requiredCapabilityName];
				const capabilityOptions = this._requiredCapabilities[capabilityId].overrides;
				await this.setCapabilityOptions(requiredCapabilityName, capabilityOptions);
				addedCapabilityNames.push(requiredCapabilityName);
			}
		}

		for (const setOptionsName of requiredCapabilitiesNames) {								// Each requiredCapabilityName
			if (!addedCapabilityNames.includes(setOptionsName)) {									//		Not just added - so we are interested in a force list
				const capabilityId = nameToIdMap[setOptionsName];
				const forceNames = this._requiredCapabilities[capabilityId].force;
				if (forceNames.length !== 0) {																			//				Capability has a force list
					const overrides = this._requiredCapabilities[capabilityId].overrides;
					let appliedOverrides = {};
					for (const forceName of forceNames) {															//						For each force name
						if (forceName in overrides) {																		//							There is an override for this name
							appliedOverrides[forceName] = overrides[forceName];						//								Prepare to apply the override
						}
					}
					if (Object.keys(appliedOverrides).length > 0) {										//						There some options being forced
						this.homey.log(`krakenDevice.applyCapabilities: ${this.getName()} change capability id ${nameToIdMap[setOptionsName]} overrides ${JSON.stringify(appliedOverrides)}`);
						await this.setCapabilityOptions(setOptionsName, appliedOverrides);
					}
				}
			}
		}

		this._requiredCapabilities = {};
	}

	/**
	 * Get the capability name from the capability ID
	 * @param 	{symbol} capabilityId					ID of the capability defined in the registry
	 * @returns {string}											Name of the capability
	 */
	getCapabilityName(capabilityId) {
		const name = this._capabilityIds[capabilityId];
		if (!name) {
			this.homey.log(`krakenDevice.getCapabilityName: id ${capabilityId} not found`);
			throw new Error(`krakenDevice.getCapabilityName: invalid capability id ${capabilityId} on ${this.getName()}`);
		}
		return name;
	}

	/**
	 * Read the value of a capability using the capability ID
	 * @param {symbol} capabilityID			ID of the capability defined in the registry
	 * @returns {any}										capability value
	 */
	readCapabilityValue(capabilityID) {
		const name = this.getCapabilityName(capabilityID);
		return this.getCapabilityValue(name);
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