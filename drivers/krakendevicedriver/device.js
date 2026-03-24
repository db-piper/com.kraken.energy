'use strict';

const Homey = require('homey');
const { DateTime } = require('../../bundles/luxon');
const krakenAccountWrapper = require('../../modules/krakenAccountWrapper');
const Capabilities = require('../../modules/capabilities');
const { TokenSetting, TokenExpirySetting, ApiKeySetting, AccountIdSetting, EventTime, SlotEndTime, ExtremePrices, PeriodStartDay, DeviceSettingNames } = require('../../modules/constants');

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
		// Trigger the driver to check if the poller needs to start
		await this.driver.startEventPoller();
		this.log('krakenDevice:onAdded - generic krakenDevice has been added');
	}

	/**
	 * onSettings is called when the user updates the device's settings.
	 * @param 	{object} 		event 							The onSettings event data
	 * @param 	{object} 		event.oldSettings 	The old settings object
	 * @param 	{object} 		event.newSettings 	The new settings object
	 * @param 	{string[]} 	event.changedKeys 	An array of keys changed since the previous version
	 * @returns {Promise<string|void>} 					Return a custom message that will be displayed
	 */
	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.log(`krakenDevice:onSettings settings were changed: ${JSON.stringify(newSettings)}`);
		const sharedSettings = Object.fromEntries(
			changedKeys
				.filter(name => DeviceSettingNames.includes(name))
				.map(name => [name, newSettings[name]])
		);
		this.log(`krakenDevice:onSettings - shared settings: ${JSON.stringify(sharedSettings)}`);
		for (const device of this.driver.getDevices()) {
			if (!Object.is(device, this)) {
				this.homey.log(`krakenDevice:onSettings - updating settings for device: ${device.getName()}`);
				await device.setSettings(sharedSettings);
			}
			await device.onSettingsChanged({ oldSettings, newSettings, changedKeys })
		}
		if (changedKeys.includes('periodStartDay')) {
			this.homey.app.periodStartDay = newSettings.periodStartDay;
		}
	}

	/**
	 * onSettingsChanged is called when the user updates the device's settings.
	 * @param 	{object} 		event 				The onSettings event data
	 * @param 	{object} 		event.oldSettings 	The old settings object
	 * @param 	{object} 		event.newSettings 	The new settings object
	 * @param 	{string[]} 	event.changedKeys 	An array of keys changed since the previous version
	 * @returns {Promise<string|void>} 				return a custom message that will be displayed
	 */
	async onSettingsChanged({ oldSettings, newSettings, changedKeys }) {
		this.log(`krakenDevice:onSettingsChanged settings were changed: ${JSON.stringify(changedKeys)}`);
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
	 * onUninit is called when the device is destroyed
	 */
	async onUninit() {
		this.log('krakenDevice:onUninit - generic krakenDevice UnInitialization Started');
		this._requiredCapabilities = null;
		this._updatedCapabilities = null;
		this._wrapper = null;
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
		this.log(`krakenDevice Device: migrateStore - migrating store values for device ${this.getName()}.`);
	}

	/**
	 * Manufacture an instance of krakenAccountWrapper
	 * @returns {krakenAccountWrapper} 	Instance of krakenAccountWrapper
	 */
	get wrapper() {
		return this.driver.wrapper;
	}

	/**
	 * Get the current dispatch for a given time from the array of planned dispatches for all devices
	 * @param 	{number} atTimeMillis 			String representation of the event time
	 * @param 	{object} plannedDispatches 	JSON object containing planned dispatches for all devices
	 * @returns {object} 										Current dispatch or undefined if no dispatch currently active
	 */
	getCurrentDispatch(atTimeMillis, plannedDispatches) {
		let dispatches = [];
		for (const deviceHash of Object.keys(plannedDispatches)) {
			for (const dispatch of plannedDispatches[deviceHash]) {
				dispatches.push(dispatch);
			}
		}
		const currentDispatch = this.wrapper.currentExtendedDispatch(atTimeMillis, dispatches);
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
				totalDispatchMinutes += device.readCapabilityValue(device._capIds.DISPATCH_MINUTES);
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
	 * Collects all buffered updates for this device into an array of promises
	 * @returns {Promise<boolean>[]} Array of "in-flight" update promises
	 */
	updateCapabilities() {
		let updatePromises = [];
		if (this._updatedCapabilities && Object.keys(this._updatedCapabilities).length > 0) {
			const entries = Object.entries(this._updatedCapabilities);
			// Map entries to promises using the Factory
			updatePromises = entries.map(([id, value]) => {
				return this.updateCapabilityValue(this._capabilityIds[id], value);
			});
		}

		// Clear the buffer BEFORE returning, so subsequent calls don't duplicate work
		this._updatedCapabilities = {};

		return updatePromises;
	}

	/**
	 * Tolerant update of a capability value (Promise Factory)
	 * @param     {string}            capabilityName    The name of the capability
	 * @param     {any}               newValue          The new value
	 * @returns   {Promise<boolean>}                    Resolves to true if value changed
	 */
	updateCapabilityValue(capabilityName, newValue) {
		if (!this.hasCapability(capabilityName)) {
			this.homey.log(`krakenDevice.updateCapabilityValue: ${this.getName()}.${capabilityName} not found`);
			return Promise.resolve(false);
		}

		const oldValue = this.getCapabilityValue(capabilityName);

		if (oldValue !== newValue) {
			this.homey.log(`krakenDevice.updateCapabilityValue: Updating ${this.getName()}.${capabilityName} from ${oldValue} to ${newValue}`);

			// Fire and return the promise; .then(() => true) ensures we track the change
			return this.setCapabilityValue(capabilityName, newValue)
				.then(() => true)
				.catch(err => {
					this.error(`krakenDevice.updateCapabilityValue: Failed to set ${capabilityName}: on ${this.getName()}`, err);
					throw err; // Re-throw so the Orchestrator's catch block sees it
				});
		}

		return Promise.resolve(false);
	}

	/**
	 * Define the standard interface for processEvent.
	 * @param     {number}        atTimeMillis      Event time in milliseconds since the epoch
	 * @param     {object}        periodChanges     Indicates periods have changed (chunk, tariffslot, day and period)
	 * @param     {object - JSON} liveMeterReading  SmartMeterTelemetry {demand, export, consumption, readAt}
	 * @param			{object[]}			plannedDispatches	Array of planned dispatches by device
	 * @param			{object}				account						Account abstract from Kraken
	 * @param			{object}				importTariff			Import tariff object from Kraken
	 * @param			{object}				exportTariff			Export tariff object from Kraken
	 * @param			{object}				devices						Map of devices from Kraken
	 * @param			{object}				deviceStates			Map of device current states from Kraken
	 * @returns   {Promise<boolean>}                Indicates if any updates are queued to the device capabilities
	 */
	processEvent(atTimeMillis, periodChanges, liveMeterReading = undefined, plannedDispatches = {}, account = undefined, importTariff = undefined, exportTariff = undefined, devices = undefined, deviceStates = undefined) {
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