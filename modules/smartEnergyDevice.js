'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class smartEnergyDevice extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('smartEnergyDevice:onInit - smartEnergyDevice has been initialized');
		await super.onInit();

		this.defineCapability("device_attribute.name", { "title": { "en": "Device Name" } });
		this.defineCapability("device_attribute.status", { "title": { "en": "Current Status" } });
		this.defineCapability("item_count.planned_dispatches", { "title": { "en": "Future Dispatches" } });			//Integer
		this.defineCapability("data_presence.in_dispatch", { "title": { "en": "Dispatching Now" } });						//Boolean
		this.defineCapability("alarm_power", { "title": { "en": "In Dispatch" }, "uiComponent": null });				//Boolean
		this.defineCapability("date_time.current_dispatch_start", { "title": { "en": "Planned Start" } });			//DD/mm HH:MM [dd/LL T]
		this.defineCapability("date_time.current_dispatch_end", { "title": { "en": "Planned Finish" } });				//DD/mm HH:MM [dd/LL T]
		this.defineCapability("duration.remaining_duration", { "title": { "en": "Remaining Duration" } });			//HH:MM (duration.toFormat(hh:mm))
		this.defineCapability("duration.next_dispatch_countdown", { "title": { "en": "Next Dispatch Countdown" } });	//HH:MM
		this.defineCapability("date_time.next_dispatch_start", { "title": { "en": "Next Planned Start" } });		//DD/mm HH:MM [dd/LL T]
		this.defineCapability("item_count.dispatch_minutes", { "title": { "en": "Dispatched Minutes Today" }, "units": { "en": "mn" } });				//Integer	

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
	 * Process a event
	 * @param   {string}    atTime            Date-time to process event for
	 * @param   {boolean}   newDay            Indicates the event is the first in a new day
	 * @param   {JSON}      liveMeterReading  The live meter reading data
	 * @param   {[JSON]}    plannedDispatches Array of planned dispatches
	 * @returns {boolean}                     True if any capabilities were updated
	 */
	async processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = {}) {

		let updates = super.processEvent(atTime, newDay, liveMeterReading, plannedDispatches);

		const eventTime = this.accountWrapper.getLocalDateTime(new Date(atTime));
		const deviceId = this.getStoreValue("deviceId");
		const deviceKey = this.accountWrapper.hashDeviceId(deviceId);
		const deviceData = await this.accountWrapper.getDevice(deviceId);
		if (deviceData === undefined) {
			await this.setUnavailable("bad device; please delete.");
			return false;
		}
		const deviceName = deviceData.name;
		const deviceStatus = this.accountWrapper.translateDeviceStatus(deviceData.status.currentState);
		const deviceDispatches = ((deviceKey in plannedDispatches) && (plannedDispatches[deviceKey] !== null)) ? plannedDispatches[deviceKey] : [];
		const futureDispatches = this.accountWrapper.futureDispatches(atTime, deviceDispatches);
		const dispatchCount = futureDispatches.length;
		const currentDispatch = this.accountWrapper.currentPlannedDispatch(atTime, deviceDispatches);   //dispatch or undefined
		const nextDispatch = await this.accountWrapper.earliestDispatch(futureDispatches)               //dispatch or undefined
		const inDispatch = currentDispatch !== undefined;                                               //receiving reduced price domestic energy

		let startTime = null;
		let endTime = null;
		let duration = null;
		let nextDispatchStart = null;
		let countDownStart = eventTime;
		let countDown = null;
		let dispatchMinutes = newDay ? 0 : this.getCapabilityValue("item_count.dispatch_minutes");

		if (inDispatch) {
			const startDateTime = this.accountWrapper.getLocalDateTime(new Date(currentDispatch.start));
			startTime = startDateTime.toFormat("dd/LL T");
			const endDateTime = this.accountWrapper.getLocalDateTime(new Date(currentDispatch.end));
			endTime = endDateTime.toFormat("dd/LL T");
			countDownStart = endDateTime;
			duration = endDateTime.diff(eventTime, ['hours', 'minutes']).toFormat("hh:mm");
			dispatchMinutes = dispatchMinutes + 1;
		}

		if (dispatchCount > 0) {
			const nextStartDateTime = this.accountWrapper.getLocalDateTime(new Date(nextDispatch.start));
			nextDispatchStart = nextStartDateTime.toFormat("dd/LL T");
			countDown = nextStartDateTime.diff(countDownStart, ['hours', 'minutes']).toFormat("hh:mm");
		}

		this.updateCapabilityValue("device_attribute.name", deviceName);
		this.updateCapabilityValue("device_attribute.status", deviceStatus);
		this.updateCapabilityValue("item_count.planned_dispatches", dispatchCount);
		this.updateCapabilityValue("date_time.current_dispatch_start", startTime);
		this.updateCapabilityValue("date_time.current_dispatch_end", endTime);
		this.updateCapabilityValue("duration.remaining_duration", duration);
		this.updateCapabilityValue("date_time.next_dispatch_start", nextDispatchStart);
		this.updateCapabilityValue("duration.next_dispatch_countdown", countDown);
		this.updateCapabilityValue("data_presence.in_dispatch", inDispatch);
		this.updateCapabilityValue("alarm_power", inDispatch);
		this.updateCapabilityValue("item_count.dispatch_minutes", dispatchMinutes);

		updates = await this.updateCapabilities(updates);

		return updates;
	}

}