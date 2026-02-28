'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class smartEnergyDevice extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('smartEnergyDevice:onInit - smartEnergyDevice Initialization Started');
		await super.onInit();

		this.defineCapability(this._capIds.DEVICE_NAME, { "title": { "en": "Device Name" } });
		this.defineCapability(this._capIds.DEVICE_STATUS, { "title": { "en": "Current Status" } });
		this.defineCapability(this._capIds.PLANNED_DISPATCHES, { "title": { "en": "Future Dispatches" } });			//Integer
		this.defineCapability(this._capIds.IN_DISPATCH, { "title": { "en": "Dispatching Now" } });						//Boolean
		this.defineCapability(this._capIds.ALARM_POWER, { "title": { "en": "In Dispatch" }, "uiComponent": null });				//Boolean
		this.defineCapability(this._capIds.CURRENT_DISPATCH_START, { "title": { "en": "Planned Start" } });			//DD/mm HH:MM [dd/LL T]
		this.defineCapability(this._capIds.CURRENT_DISPATCH_END, { "title": { "en": "Planned Finish" } });				//DD/mm HH:MM [dd/LL T]
		this.defineCapability(this._capIds.REMAINING_DISPATCH_DURATION, { "title": { "en": "Remaining Duration" } });			//HH:MM (duration.toFormat(hh:mm))
		this.defineCapability(this._capIds.NEXT_DISPATCH_COUNTDOWN, { "title": { "en": "Next Dispatch Countdown" } });	//HH:MM
		this.defineCapability(this._capIds.NEXT_DISPATCH_START, { "title": { "en": "Next Planned Start" } });		//DD/mm HH:MM [dd/LL T]
		this.defineCapability(this._capIds.DISPATCH_MINUTES, { "title": { "en": "Dispatched Minutes Today" }, "units": { "en": "mn" } });				//Integer	

		await this.applyCapabilities();
		await this.applyStoreValues();

		this.log('smartEnergyDevice:onInit - smartEnergyDevice Initialization Completed');
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
	 * Indicate if the device is (still) an available device
	 * @param			{object}				accountData				Current account data from Kraken
	 * @returns		{Promise<boolean>}								Indicates if the device is available
	 */
	async setDeviceAvailability(accountData) {
		let available = super.setDeviceAvailability(accountData);
		const deviceId = this.getStoreValue("deviceId");
		const deviceData = this.accountWrapper.getDevice(deviceId, accountData);
		if (!deviceData) {
			await this.setUnavailable("bad device; please delete.");
			available = false;
		}
		return available;
	}


	/**
	 * Process a timed event
	 * @param   {string}    atTime            Date-time to process event for
	 * @param   {boolean}   newDay            Indicates the event is the first in a new day
	 * @param   {JSON}      liveMeterReading  The live meter reading data
	 * @param   {[JSON]}    plannedDispatches Array of planned dispatches
	 * @returns {boolean}                     True if any capabilities were updated
	 */
	processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = {}, accountData = undefined) {

		let updates = super.processEvent(atTime, newDay, liveMeterReading, plannedDispatches, accountData);

		const eventTime = this.accountWrapper.getLocalDateTime(new Date(atTime));
		const deviceId = this.getStoreValue("deviceId");
		const deviceKey = this.accountWrapper.hashDeviceId(deviceId);
		const deviceData = this.accountWrapper.getDevice(deviceId, accountData);
		const deviceName = deviceData.name;
		const deviceStatus = this.accountWrapper.translateDeviceStatus(deviceData.status.currentState);
		const deviceDispatches = ((deviceKey in plannedDispatches) && (plannedDispatches[deviceKey] !== null)) ? plannedDispatches[deviceKey] : [];
		const futureDispatches = this.accountWrapper.futureDispatches(atTime, deviceDispatches);
		const dispatchCount = futureDispatches.length;
		const currentDispatch = this.accountWrapper.currentPlannedDispatch(atTime, deviceDispatches);   //dispatch or undefined
		const nextDispatch = this.accountWrapper.earliestDispatch(futureDispatches)               //dispatch or undefined
		const inDispatch = currentDispatch !== undefined;                                               //receiving reduced price domestic energy

		let startTime = null;
		let endTime = null;
		let duration = null;
		let nextDispatchStart = null;
		let countDownStart = eventTime;
		let countDown = null;
		let dispatchMinutes = newDay ? 0 : this.readCapabilityValue(this._capIds.DISPATCH_MINUTES);

		if (inDispatch) {
			const startDateTime = this.accountWrapper.getLocalDateTime(new Date(currentDispatch.start));
			startTime = startDateTime.toFormat("dd/LL T");
			const endDateTime = this.accountWrapper.getLocalDateTime(new Date(currentDispatch.end));
			endTime = endDateTime.toFormat("dd/LL T");
			countDownStart = endDateTime;
			duration = endDateTime.diff(eventTime, ['hours', 'minutes']).toFormat("hh:mm");
			dispatchMinutes = dispatchMinutes + 1;   //FREQ: change to increment by polling interval in minutes
		}

		if (dispatchCount > 0) {
			const nextStartDateTime = this.accountWrapper.getLocalDateTime(new Date(nextDispatch.start));
			nextDispatchStart = nextStartDateTime.toFormat("dd/LL T");
			countDown = nextStartDateTime.diff(countDownStart, ['hours', 'minutes']).toFormat("hh:mm");
		}

		this.updateCapability(this._capIds.DEVICE_NAME, deviceName);
		this.updateCapability(this._capIds.DEVICE_STATUS, deviceStatus);
		this.updateCapability(this._capIds.PLANNED_DISPATCHES, dispatchCount);
		this.updateCapability(this._capIds.IN_DISPATCH, inDispatch);
		this.updateCapability(this._capIds.ALARM_POWER, inDispatch);
		this.updateCapability(this._capIds.CURRENT_DISPATCH_START, startTime);
		this.updateCapability(this._capIds.CURRENT_DISPATCH_END, endTime);
		this.updateCapability(this._capIds.REMAINING_DISPATCH_DURATION, duration);
		this.updateCapability(this._capIds.NEXT_DISPATCH_COUNTDOWN, countDown);
		this.updateCapability(this._capIds.NEXT_DISPATCH_START, nextDispatchStart);
		this.updateCapability(this._capIds.DISPATCH_MINUTES, dispatchMinutes);

		return updates;
	}

}