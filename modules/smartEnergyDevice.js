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
    this.defineCapability("item_count.planned_dispatches", {"title": {"en": "Future Dispatches"}});			//Integer
		this.defineCapability("data_presence.in_dispatch", {"title": {"en": "Dispatching Now"}});						//Boolean
		this.defineCapability("date_time.current_dispatch_start", {"title": {"en": "Planned Start"}});			//DD/mm HH:MM [dd/LL T]
		this.defineCapability("date_time.current_dispatch_end", {"title": {"en": "Planned Finish"}});				//DD/mm HH:MM [dd/LL T]
		this.defineCapability("date_time.current_early_start", {"title": {"en": "Advanced Start"}});				//DD/mm HH:MM [dd/LL T]
		this.defineCapability("date_time.current_extended_end", {"title": {"en": "Extended Finish"}});			//DD/mm HH:MM [dd/LL T]
    this.defineCapability("duration.remaining_duration", {"title": {"en": "Remaining Duration"}});			//HH:MM (duration.toFormat(hh:mm))
		this.defineCapability("duration.next_dispatch_countdown", {"title": {"en": "Next Dispatch Countdown"}});	//HH:MM
    this.defineCapability("date_time.next_dispatch_start", {"title": {"en": "Next Planned Start"}});		//DD/mm HH:MM [dd/LL T]
		this.defineCapability("date_time.next_early_start", {"title": {"en": "Next Advanced Start"}});			//DD/mm HH:MM [dd/LL T]

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

		const eventTime = this.accountWrapper.getLocalDateTime(new Date(atTime));
		const deviceId = this.getStoreValue("deviceId");
		const deviceKey = this.accountWrapper.hashDeviceId(deviceId);
		const deviceData = await this.accountWrapper.getDevice(deviceId);
		const deviceName = deviceData.name;
		const deviceStatus = this.accountWrapper.translateDeviceStatus(deviceData.status.currentState);
		const deviceDispatches = plannedDispatches[deviceKey];
		const futureDispatches = this.accountWrapper.futureDispatches(atTime, deviceDispatches);
		const dispatchCount = futureDispatches.length;
		const currentDispatch = this.accountWrapper.currentDispatch(atTime, deviceDispatches);    //dispatch or undefined
		const nextDispatch = await this.accountWrapper.earliestDispatch(futureDispatches)					//dispatch or undefined
		const inDispatch = currentDispatch !== undefined;

		let startTime = null;
		let endTime = null;
		let advancedStartTime = null;
		let extendedEndTime = null;
		let duration = "00:00";
		let nextDispatchStart = null;
		let nextAdvancedStart = null;
		let countDownStart = eventTime;
		let countDown = null;
		
		if (inDispatch) {
			startTime = this.accountWrapper.getLocalDateTime(new Date(currentDispatch.start)).toFormat("dd/LL T");
			advancedStartTime = this.accountWrapper.advanceTime(currentDispatch.start).toFormat("dd/LL T");
			endTime = this.accountWrapper.getLocalDateTime(new Date(currentDispatch.end)).toFormat("dd/LL T");
			const extendedEndDateTime = this.accountWrapper.extendTime(currentDispatch.end);
			countDownStart = extendedEndDateTime;
			extendedEndTime = extendedEndDateTime.toFormat("dd/LL T");
			duration = extendedEndDateTime.diff(eventTime,['hours', 'minutes']).toFormat("hh:mm");
		}

		if (dispatchCount > 0) {
			this.homey.log(`smartEnergyDevice.processEvent: Next Dispatch ${JSON.stringify(nextDispatch)}`);
			const nextDispatchAdvancedStart = this.accountWrapper.advanceTime(nextDispatch.start);
			nextDispatchStart = this.accountWrapper.getLocalDateTime(new Date(nextDispatch.start)).toFormat("dd/LL T");
			nextAdvancedStart = nextDispatchAdvancedStart.toFormat("dd/LL T");
			countDown = nextDispatchAdvancedStart.diff(countDownStart,['hours', 'minutes']).toFormat("hh:mm");
		}

		this.updateCapabilityValue("device_attribute.name", deviceName);
		this.updateCapabilityValue("device_attribute.status", deviceStatus);
	  this.updateCapabilityValue("item_count.planned_dispatches", dispatchCount);
		this.updateCapabilityValue("data_presence.in_dispatch", inDispatch);
		this.updateCapabilityValue("date_time.current_dispatch_start", startTime);
		this.updateCapabilityValue("date_time.current_dispatch_end", endTime);
		this.updateCapabilityValue("date_time.current_early_start", advancedStartTime);
		this.updateCapabilityValue("date_time.current_extended_end",extendedEndTime);
		this.updateCapabilityValue("duration.remaining_duration", duration);
		this.updateCapabilityValue("date_time.next_dispatch_start", nextDispatchStart);
		this.updateCapabilityValue("date_time.next_early_start", nextAdvancedStart);
		this.updateCapabilityValue("duration.next_dispatch_countdown", countDown);

		updates = await this.updateCapabilities(updates);

		return updates;
	}

}