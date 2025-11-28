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
		this._updatedCapabilities = new Map();
		this._storeValues = {};
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('krakenDevice:onAdded - generic krakenDevice has been added');
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
    this.log('krakenDevice:onSettings settings were changed');
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

	getCurrentDispatch(atTime, plannedDispatches) {
		let dispatches = [];
		for (const deviceHash of Object.keys(plannedDispatches)) {
			for (const dispatch of plannedDispatches[deviceHash]) {
				dispatches.push(dispatch);
			}
		}
		const currentDispatch = this.accountWrapper.currentDispatch(atTime, dispatches);
		return currentDispatch;
	}

	/**
	 * Queue the update of the value of the named capability
	 * @param {string} 	capabilityName 		Name of the capability to be updated
	 * @param {any} 		newValue 					New value to be assigned to the capability
	 */
	updateCapability(capabilityName, newValue) {
		this._updatedCapabilities.set(capabilityName, newValue);
	}

	/**
	 * Perform the queued updates to capability values
	 * @param 	{boolean}		updates		True iff any preceding capability has been updated
	 * @returns {boolean}							True iff this or any preceding capability has its value changed
	 */
	async updateCapabilities(updates) {
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
		}
		return updated;
	}

	/**
	 * Define the standard interface for processEvent.
	 * @param     {string}        atTime            String representation of the event time
	 * @param     {boolean}       newDay            Indicates that any newDay processing should occur
	 * @param     {object - JSON} liveMeterReading  SmartMeterTelemetry {demand, export, consumption, readAt} 
	 * @returns   {boolean}                         Indicates if any updates have been made to the device capabilities
	 */
	async processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = {}) {
		return false;
	}

	/**
	 * Return the app's current instance of krakenAccountWrapper
	 * @returns		{object - krakenAccountManager}		Current app instance of the account wrapper
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
		const hourChange = newTime.getUTCHours()!==oldTime.getUTCHours(); 
		return hourChange;
	}

	/**
	 * Establish a capability definition to be applied to a device
	 * @param {string} 		name				Name of the capability 
	 * @param {object} 		overrides 	Object defining capability options to be set
	 * @param {string[]}	force				List of option names to be forced to update		
	 */
  defineCapability(name, overrides = {}, force = []) {
		this._requiredCapabilities.set(name, {overrides: overrides, force: force});
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

		for (const setOptionsName of requiredCapabilitiesNames) {							// Each requiredCapabilityName
			if (!addedCapabilityNames.includes(setOptionsName)) {								//		Not just added - so we are interested in a force list
				const forceNames = this._requiredCapabilities.get(setOptionsName).force;
				if (forceNames.length !== 0){																			//				Capability has a force list
					const overrides = this._requiredCapabilities.get(setOptionsName).overrides;
					let appliedOverrides = {};
					for (const forceName of forceNames) {														//						For each force name
						if (forceName in overrides) {																	//								There is an override for this name
							appliedOverrides[forceName] = overrides[forceName];					//										Prepare to apply the override
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
	 * @param {string} 	name					Name of the value 
	 * @param {any} 		value 				Value to be associated with the name
	 */
	defineStoreValue(name, value) {
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
