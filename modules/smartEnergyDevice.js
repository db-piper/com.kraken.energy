'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class smartEnergyDevice extends krakenDevice {

  /**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('smartEnergyDevice:onInit - smartEnergyDevice has been initialized');
		await super.onInit();
		this.defineCapability("device_attribute.name", {"title": {"en": "Device Name"}});
    this.defineCapability("device_attribute.status", {"title": {"en": "Current Status"}});
    this.defineCapability("item_count.planned_dispatches", {"title": {"en": "Planned Dispatches"}});
    this.defineCapability("date_time.next_dispatch_start", {"title": {"en": "Next Dispatch"}});
    this.defineCapability("duration.dispatch_duration", {"title": {"en": "Dispatch Duration"}});

    await this.applyCapabilities();
		await this.applyStoreValues();

	}

	/**
	 * onAdded is called when the user adds the device, called just after pairing.
	 */
	async onAdded() {
		this.log('smartEnergyDevice:onAdded - has been added');
	}

	/**
	 * onRenamed is called when the user updates the device's name.
	 * This method can be used this to synchronise the name to the device.
	 * @param {string} name The new name
	 */
	async onRenamed(name) {
		this.log('smartEnergyDevice:onRenamed - was renamed');
	}

	/**
	 * onDeleted is called when the user deleted the device.
	 */
	async onDeleted() {
		this.log('smartEnergyDevice:onDeleted - has been deleted');
	}

	/**
	 * onSettings is called when the user updates the device's settings.
	 * @param 	{object} 		event 						 	The onSettings event data
	 * @param 	{object} 		event.oldSettings 	The old settings object
	 * @param 	{object} 		event.newSettings 	The new settings object
	 * @param 	{string[]} 	event.changedKeys 	An array of keys changed since the previous version
	 * @returns {Promise<string|void>} 					Return a custom message that will be displayed
	 */
	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.log('smartEnergyDevice:onSettings - settings were changed');
	}

	async processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = undefined) {
	}

}