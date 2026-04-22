'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");
const dayjs = require('../bundles/dayjs-bundled/index.js');

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
    this.defineCapability(this._capIds.PLANNED_ENERGY_TOTAL, { "title": { "en": "Remaining Energy" }, "decimals": 3 }, ['title', 'decimals']);			//Integer
    this.defineCapability(this._capIds.PLAN_END_TIME, { "title": { "en": "Plan End Time" } });			      //DD/mm HH:MM [dd/LL T]
    this.defineCapability(this._capIds.IN_DISPATCH, { "title": { "en": "Dispatching Now" } });						//Boolean
    this.defineCapability(this._capIds.CURRENT_DISPATCH_TYPE, { "title": { "en": "Dispatch Type" } });			//String
    this.defineCapability(this._capIds.CURRENT_DISPATCH_ENERGY, { "title": { "en": "Dispatch Energy" }, "decimals": 3 });			//Integer
    this.defineCapability(this._capIds.ALARM_POWER, { "title": { "en": "In Dispatch" }, "uiComponent": null });				//Boolean
    this.defineCapability(this._capIds.CURRENT_DISPATCH_START, { "title": { "en": "Planned Start" } });		//DD/mm HH:MM [dd/LL T]
    this.defineCapability(this._capIds.CURRENT_DISPATCH_END, { "title": { "en": "Planned Finish" } });		//DD/mm HH:MM [dd/LL T]
    this.defineCapability(this._capIds.REMAINING_DISPATCH_DURATION, { "title": { "en": "Remaining Duration" } });			//HH:MM (duration.toFormat(hh:mm))
    this.defineCapability(this._capIds.NEXT_DISPATCH_COUNTDOWN, { "title": { "en": "Next Dispatch Countdown" } });	//HH:MM
    this.defineCapability(this._capIds.NEXT_DISPATCH_START, { "title": { "en": "Next Planned Start" } });		//DD/mm HH:MM [dd/LL T]
    this.defineCapability(this._capIds.NEXT_DISPATCH_TYPE, { "title": { "en": "Next Dispatch Type" } });			//String
    this.defineCapability(this._capIds.DISPATCH_MINUTES, { "title": { "en": "Dispatched Minutes Today" }, "units": { "en": "mn" }, "insights": true }, ['insights', 'title', 'units']);				//Integer	

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
    const deviceId = this.getStoreValue("deviceId");
    if (!deviceIds.includes(deviceId)) {
      await this.setUnavailable("bad device; please delete.");
      available = false;
    }
    return available;
  }

  /**
   * Return the cache defining the active dispatch if there is a current dispatch of type SMART
   * @param   {object[]}  currentDispatch     Array of planned dispatches for this device
   * @returns {object}                        Cache defining the active dispatch
   */
  getActiveDispatchCache(currentDispatch) {
    let cache = this.getStoreValue('active_dispatch_cache');
    if (currentDispatch.length > 0 && currentDispatch[0].type === 'SMART') {
      const dispatch = currentDispatch[0];
      const start = Math.floor(Date.parse(dispatch.start) / 60000);
      const end = Math.floor(Date.parse(dispatch.end) / 60000);
      if (!cache || cache.start !== start) {
        cache = { start, end, announced: 0 };
      } else {
        cache.end = end;
      }
      this.setStoreValue('active_dispatch_cache', cache)
    }
    return cache;
  }

  /**
   * Format the duration of the remaining part of a dispatch
   * @param   {number}  diffMs    Duration in milliseconds
   * @returns {string}            Formatted duration in hh:mm format
   */
  formatDuration(diffMs) {
    const dur = dayjs.duration(diffMs);
    const seconds = dur.seconds();
    let minutes = dur.minutes();
    let hours = dur.hours();
    if (seconds >= 30) {
      minutes += 1;
    }
    if (minutes >= 60) {
      minutes = 0;
      hours += 1;
    }
    return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0');
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

    const lastEventTime = this.driver.homey.app.eventTime;
    const newDay = periodChanges.day;
    const eventTime = dayjs(atTimeMillis).tz(this.wrapper.timeZone);
    const deviceId = this.getStoreValue("deviceId");
    const deviceStateData = deviceStates.find((device) => device.id === deviceId);
    const deviceStatus = deviceStateData ? deviceStateData.currentStateTitle : "Unknown";
    const deviceKey = this.wrapper.hashDeviceId(deviceId);
    const deviceDispatches = ((deviceKey in plannedDispatches) && (plannedDispatches[deviceKey] !== null)) ? plannedDispatches[deviceKey] : [];
    const futureDispatches = this.wrapper.futureDispatches(atTimeMillis, deviceDispatches);
    const futureDispatchCount = futureDispatches.length;
    const currentDispatches = this.wrapper.getPlannedDispatches(atTimeMillis, deviceDispatches);    //array 0 or more dispatches
    const nextDispatch = this.wrapper.earliestDispatch(futureDispatches);               						//dispatch or undefined
    const inDispatch = currentDispatches.length > 0;                                                //dispatch of some sort

    let startTime = null;
    let endTime = null;
    let duration = null;
    let nextDispatchStart = null;
    let countDownStart = eventTime;
    let countDown = null;
    let dispatchType = null;
    let dispatchEnergy = null;
    let planEnergy = null;
    let planEndTime = null;
    let nextDispatchType = null;

    const smartDispatches = deviceDispatches.filter(dispatch => dispatch.type === 'SMART');
    const minutesIncrement = this.wrapper.countDispatchMinutes(smartDispatches, lastEventTime, atTimeMillis);
    const updatedDispatchMinutes = minutesIncrement + (newDay ? 0 : this.readCapabilityValue(this._capIds.DISPATCH_MINUTES));

    if (deviceDispatches.length > 0) {
      planEnergy = deviceDispatches.reduce((total, dispatch) => total + dispatch.energyAddedKwh, 0);
      const planEndTimeValue = Math.max(...deviceDispatches.map(dispatch => new Date(dispatch.end)));
      planEndTime = dayjs(planEndTimeValue).tz(this.wrapper.timeZone).format('DD/MM HH:mm');
    }

    if (inDispatch) {
      const startDateTime = dayjs(currentDispatches[0].start).tz(this.wrapper.timeZone);
      startTime = startDateTime.format('DD/MM HH:mm');
      const endDateTime = dayjs(currentDispatches[0].end).tz(this.wrapper.timeZone)
      endTime = endDateTime.format('DD/MM HH:mm');
      dispatchEnergy = currentDispatches[0].energyAddedKwh;
      countDownStart = endDateTime;
      duration = this.formatDuration(endDateTime.diff(eventTime));
      dispatchType = currentDispatches[0].type;
    }

    if (futureDispatchCount > 0) {
      const nextStartDateTime = dayjs(nextDispatch.start).tz(this.wrapper.timeZone);
      nextDispatchType = nextDispatch.type;
      nextDispatchStart = nextStartDateTime.format('DD/MM HH:mm');
      countDown = this.formatDuration(nextStartDateTime.diff(countDownStart));
    }

    if (!!devices) {
      this.updateCapability(this._capIds.DEVICE_NAME, devices[deviceKey].name);
    }
    this.updateCapability(this._capIds.DEVICE_STATUS, deviceStatus);
    this.updateCapability(this._capIds.PLANNED_DISPATCHES, futureDispatchCount);
    this.updateCapability(this._capIds.PLANNED_ENERGY_TOTAL, -planEnergy);  //Show the energy as positive
    this.updateCapability(this._capIds.PLAN_END_TIME, planEndTime);
    this.updateCapability(this._capIds.IN_DISPATCH, inDispatch);
    this.updateCapability(this._capIds.CURRENT_DISPATCH_TYPE, dispatchType);
    this.updateCapability(this._capIds.CURRENT_DISPATCH_ENERGY, -dispatchEnergy);  //Show the energy as positive
    this.updateCapability(this._capIds.ALARM_POWER, inDispatch);
    this.updateCapability(this._capIds.CURRENT_DISPATCH_START, startTime);
    this.updateCapability(this._capIds.CURRENT_DISPATCH_END, endTime);
    this.updateCapability(this._capIds.REMAINING_DISPATCH_DURATION, duration);
    this.updateCapability(this._capIds.NEXT_DISPATCH_COUNTDOWN, countDown);
    this.updateCapability(this._capIds.NEXT_DISPATCH_START, nextDispatchStart);
    this.updateCapability(this._capIds.NEXT_DISPATCH_TYPE, nextDispatchType);
    this.updateCapability(this._capIds.DISPATCH_MINUTES, updatedDispatchMinutes);

    return updates;
  }

}