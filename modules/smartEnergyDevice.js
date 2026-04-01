'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");
const krakenAccountWrapper = require("../modules/krakenAccountWrapper");
const { DateTime } = require('../bundles/luxon');

module.exports = class smartEnergyDevice extends krakenDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('smartEnergyDevice:onInit - smartEnergyDevice Initialization Started');
    await super.onInit();

    if (this.getCapabilities().length === 0) {
      await this.setSettings({
        energy_exclude: true,
        energy_cumulative_include: false
      });
    }

    this.defineCapability(this._capIds.DEVICE_NAME, { "title": { "en": "Device Name" } });
    this.defineCapability(this._capIds.DEVICE_STATUS, { "title": { "en": "Current Status" } });
    this.defineCapability(this._capIds.PLANNED_DISPATCHES, { "title": { "en": "Future Dispatches" } });			//Integer
    this.defineCapability(this._capIds.IN_DISPATCH, { "title": { "en": "Dispatching Now" } });						//Boolean
    this.defineCapability(this._capIds.ALARM_POWER, { "title": { "en": "In Dispatch" }, "uiComponent": null });				//Boolean
    this.defineCapability(this._capIds.CURRENT_DISPATCH_START, { "title": { "en": "Planned Start" } });			//DD/mm HH:MM [dd/LL T]
    this.defineCapability(this._capIds.CURRENT_DISPATCH_END, { "title": { "en": "Planned Finish" } });				//DD/mm HH:MM [dd/LL T]
    this.defineCapability(this._capIds.REMAINING_DISPATCH_DURATION, { "title": { "en": "Remaining Duration" } });			//HH:MM (duration.toFormat(hh:mm))
    this.defineCapability(this._capIds.CURRENT_DISPATCH_TYPE, { "title": { "en": "Dispatch Type" } });			//String
    this.defineCapability(this._capIds.NEXT_DISPATCH_COUNTDOWN, { "title": { "en": "Next Dispatch Countdown" } });	//HH:MM
    this.defineCapability(this._capIds.NEXT_DISPATCH_TYPE, { "title": { "en": "Next Dispatch Type" } });			//String
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
    super.onAdded();
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
    this.log(`smartEnergyDevice:onDeleted - Smartdevice has been deleted`);
  }

  /**
   * Indicate if the device is (still) an available device
   * @param			{string[]}							deviceIds			Array of smart device Ids
   * @returns		{Promise<boolean>}										Indicates if the device is available
   */
  async setDeviceAvailability(deviceIds) {
    let available = super.setDeviceAvailability(deviceIds);
    this.log(`smartEnergyDevice:setDeviceAvailability - deviceIds: ${JSON.stringify(deviceIds)}`);
    const deviceId = this.getStoreValue("deviceId");
    //const deviceData = deviceIds?.[this.wrapper.hashDeviceId(deviceId)];
    if (!deviceIds.includes(deviceId)) {
      await this.setUnavailable("bad device; please delete.");
      available = false;
    }
    return available;
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

    let updates = super.processEvent(atTimeMillis, periodChanges, liveMeterReading, plannedDispatches, account, importTariff, exportTariff, devices, deviceStates);

    const eventInterval = this.homey.app.getEventIntervalMinutes(atTimeMillis);
    const newDay = periodChanges.day;
    const eventTime = DateTime.fromMillis(atTimeMillis, { zone: this.wrapper.timeZone });
    const deviceId = this.getStoreValue("deviceId");
    const deviceStateData = deviceStates.find((device) => device.id === deviceId);
    const deviceStatus = deviceStateData ? deviceStateData.currentStateTitle : "Unknown";
    const deviceKey = this.wrapper.hashDeviceId(deviceId);
    const deviceDispatches = ((deviceKey in plannedDispatches) && (plannedDispatches[deviceKey] !== null)) ? plannedDispatches[deviceKey] : [];
    const futureDispatches = this.wrapper.futureDispatches(atTimeMillis, deviceDispatches);
    const dispatchCount = futureDispatches.length;
    const currentDispatch = this.wrapper.currentPlannedDispatch(atTimeMillis, deviceDispatches)   //dispatch or undefined
    const nextDispatch = this.wrapper.earliestDispatch(futureDispatches)               						//dispatch or undefined
    const inDispatch = currentDispatch !== undefined;                                             //receiving reduced price domestic energy

    let startTime = null;
    let endTime = null;
    let duration = null;
    let nextDispatchStart = null;
    let countDownStart = eventTime;
    let countDown = null;
    let dispatchMinutes = newDay ? 0 : this.readCapabilityValue(this._capIds.DISPATCH_MINUTES);
    let dispatchType = null;
    let nextDispatchType = null;

    if (inDispatch) {
      const startDateTime = DateTime.fromISO(currentDispatch.start, { zone: this.wrapper.timeZone });
      startTime = startDateTime.toFormat("dd/LL T");
      const endDateTime = DateTime.fromISO(currentDispatch.end, { zone: this.wrapper.timeZone })
      endTime = endDateTime.toFormat("dd/LL T");
      countDownStart = endDateTime;
      duration = endDateTime.diff(eventTime, ['hours', 'minutes']).toFormat("hh:mm");
      dispatchMinutes = dispatchMinutes + eventInterval;   //FREQ: change to increment by polling interval in minutes
      dispatchType = currentDispatch.type;
    }

    if (dispatchCount > 0) {
      const nextStartDateTime = DateTime.fromISO(nextDispatch.start, { zone: this.wrapper.timeZone });
      nextDispatchType = nextDispatch.type;
      nextDispatchStart = nextStartDateTime.toFormat("dd/LL T");
      countDown = nextStartDateTime.diff(countDownStart, ['hours', 'minutes']).toFormat("hh:mm");
    }

    if (!!devices) {
      this.updateCapability(this._capIds.DEVICE_NAME, devices[deviceKey].name);
    }
    this.updateCapability(this._capIds.DEVICE_STATUS, deviceStatus);
    this.updateCapability(this._capIds.PLANNED_DISPATCHES, dispatchCount);
    this.updateCapability(this._capIds.IN_DISPATCH, inDispatch);
    this.updateCapability(this._capIds.ALARM_POWER, inDispatch);
    this.updateCapability(this._capIds.CURRENT_DISPATCH_START, startTime);
    this.updateCapability(this._capIds.CURRENT_DISPATCH_END, endTime);
    this.updateCapability(this._capIds.CURRENT_DISPATCH_TYPE, dispatchType);
    this.updateCapability(this._capIds.REMAINING_DISPATCH_DURATION, duration);
    this.updateCapability(this._capIds.NEXT_DISPATCH_COUNTDOWN, countDown);
    this.updateCapability(this._capIds.NEXT_DISPATCH_START, nextDispatchStart);
    this.updateCapability(this._capIds.NEXT_DISPATCH_TYPE, nextDispatchType);
    this.updateCapability(this._capIds.DISPATCH_MINUTES, dispatchMinutes);

    return updates;
  }

}