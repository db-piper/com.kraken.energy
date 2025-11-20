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
    this.defineCapability("item_count.planned_dispatches", {"title": {"en": "Planned Dispatches"}});		//Integer
		this.defineCapability("data_presence.in_dispatch", {"title": {"en": "Dispatching Now"}});						//Boolean
		this.defineCapability("date_time.current_dispatch_start", {"title": {"en": "Dispatch Start"}});			//DD/mm HH:MM [dd/LL T]
		this.defineCapability("date_time.current_dispatch_end", {"title": {"en": "Dispatch End"}});					//DD/mm HH:MM [dd/LL T]
    this.defineCapability("duration.remaining_duration", {"title": {"en": "Remaining Duration"}});			//HH:MM (duration.toFormat(hh:mm))
    this.defineCapability("date_time.next_dispatch_start", {"title": {"en": "Next Dispatch"}});					//DD/mm HH:MM [dd/LL T]

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
		
		let updates = super.processEvent(atTime, newDay, liveMeterReading, plannedDispatches);

		const deviceId = this.getStoreValue("deviceId");
		const deviceData = await this.accountWrapper.getDevice(deviceId);
		const deviceName = deviceData.name;
		const deviceStatus = this.accountWrapper.translateDeviceStatus(deviceData.status.currentState);

		this.homey.log(`smartEnergyDevice.processEvent: ID ${deviceId} Name ${deviceName} Status: ${deviceStatus}`);

		this.updateCapabilityValue("device_attribute.name", deviceName);
		this.updateCapabilityValue("device_attribute.status", deviceStatus);

		updates = this.updateCapabilities(updates);

		return updates;
	}

}