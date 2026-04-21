'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");
const krakenAccountWrapper = require("../modules/krakenAccountWrapper");
//const dayjs = require('dayjs');
const dayjs = require('../bundles/dayjs-bundled/index.js');

module.exports = class energyAccount extends krakenDevice {

  #dispatchMinutes = 0;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('energyAccount Device:onInit - energyAccount Initialization Started');
    await super.onInit();
    this.#dispatchMinutes = 0;

    if (this.hasCapability("measure_monetary.chunk_accumulated_value")) {
      this.log(`energyAccount Device:onInit - Old capability detected, reset all capabilities`);
      await this.applyCapabilities();
    }

    if (this.getCapabilities().length === 0) {
      await this.setSettings({
        energy_exclude: false,
        energy_cumulative_include: true
      });
    }

    const hasExport = this.hasExport;

    this.defineCapability(this._capIds.PERIOD_START_TEXT, { "title": { "en": "This Period Start" } });
    this.defineCapability(this._capIds.PERIOD_NEXT_START_TEXT, { "title": { "en": "Next Start Day" } });
    this.defineCapability(this._capIds.PERIOD_DAY_NUMBER, { "title": { "en": "Period Day Number" } });
    this.defineCapability(this._capIds.PERIOD_DURATION, { "title": { "en": "Period Duration" } });
    this.defineCapability(this._capIds.ACCOUNT_BALANCE, { "title": { "en": "Account Balance" }, "units": { "en": "£" } });
    this.defineCapability(this._capIds.PROJECTED_BILL, { "title": { "en": "Projected Bill" }, "units": { "en": "£" } });
    this.defineCapability(this._capIds.IMPORT_READING, { "title": { "en": "Import Reading" }, "decimals": 3, "units": { "en": "kWh" } }, ["units", "title"]);
    this.defineCapability(this._capIds.EXPORT_READING, { "title": { "en": "Export Reading" }, "decimals": 3, "units": { "en": "kWh" } }, ["units", "title"], hasExport);
    this.defineCapability(this._capIds.PERIOD_IMPORT_ENERGY, { "title": { "en": "Period Import" }, "decimals": 3 });
    this.defineCapability(this._capIds.PERIOD_EXPORT_ENERGY, { "title": { "en": "Period Export" }, "decimals": 3 }, [], hasExport);
    this.defineCapability(this._capIds.PERIOD_IMPORT_VALUE, { "title": { "en": "Import Cost" }, "decimals": 2, "units": { "en": "£" } });
    this.defineCapability(this._capIds.PERIOD_EXPORT_VALUE, { "title": { "en": "Export Value" }, "decimals": 2, "units": { "en": "£" } }, [], hasExport);
    this.defineCapability(this._capIds.PERIOD_STANDING_CHARGE, { "title": { "en": "Standing Charge" }, "decimals": 2, "units": { "en": "£" } });
    this.defineCapability(this._capIds.PERIOD_BILL, { "title": { "en": "Bill Total" }, "decimals": 2, "units": { "en": "£" } });
    this.defineCapability(this._capIds.DAY_IMPORT_ENERGY, { "title": { "en": "Day Import" }, "decimals": 3 });
    this.defineCapability(this._capIds.DAY_EXPORT_ENERGY, { "title": { "en": "Day Export" }, "decimals": 3 }, [], hasExport);
    this.defineCapability(this._capIds.DAY_IMPORT_VALUE, { "title": { "en": "Day Import Cost" }, "decimals": 2, "units": { "en": "£" } });
    this.defineCapability(this._capIds.DAY_EXPORT_VALUE, { "title": { "en": "Day Export Value" }, "decimals": 2, "units": { "en": "£" } }, [], hasExport);
    this.defineCapability(this._capIds.CHUNK_IMPORT_ENERGY, { "title": { "en": "Chunk Import" }, "decimals": 3 });
    this.defineCapability(this._capIds.CHUNK_EXPORT_ENERGY, { "title": { "en": "Chunk Export" }, "decimals": 3 }, [], hasExport);
    this.defineCapability(this._capIds.CHUNK_IMPORT_VALUE, { "title": { "en": "Chunk Import Cost" }, "decimals": 2, "units": { "en": "£" } });
    this.defineCapability(this._capIds.CHUNK_EXPORT_VALUE, { "title": { "en": "Chunk Export Value" }, "decimals": 2, "units": { "en": "£" } }, [], hasExport);
    this.defineCapability(this._capIds.CURRENT_IMPORT_POWER, { "title": { "en": "Import Power" } });
    this.defineCapability(this._capIds.CURRENT_EXPORT_POWER, { "title": { "en": "Export Power" } }, [], hasExport);
    this.defineCapability(this._capIds.OBSERVED_DAYS, { "title": { "en": "Observed Days" }, "uiComponent": null, "decimals": 0 });
    this.defineCapability(this._capIds.PRIOR_IMPORT_PRICE_PAID, { "title": { "en": "Prior Import Price Paid" }, "uiComponent": null, "decimals": 4, "units": { "en": "£" } }, ['decimals', 'title', 'uiComponent', 'units']);
    this.defineCapability(this._capIds.PRIOR_EXPORT_PRICE_PAID, { "title": { "en": "Prior Export Price Paid" }, "uiComponent": null, "decimals": 4, "units": { "en": "£" } }, ['decimals', 'title', 'uiComponent', 'units'], hasExport);
    this.defineCapability(this._capIds.NET_POWER, { "title": { "en": "Net Power" }, "units": { "en": "W" }, "uiComponent": null, "decimals": 0 });

    await this.applyCapabilities();
    await this.applyStoreValues();

    await this.setEnergy({
      cumulativeImportedCapability: this.getCapabilityName(this._capIds.IMPORT_READING),
      cumulativeExportedCapability: this.getCapabilityName(this._capIds.EXPORT_READING),
      cumulative: true
    });

    await this.updatePeriodDay(this.getSettings().periodStartDay);
    this.log('energyAccount Device:onInit - energyAccount Initialization Completed');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    super.onAdded();
    this.log('energyAccount Device:onAdded - has been added');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('energyAccount Device:onRenamed - was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('energyAccount Device:onDeleted - has been deleted');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param 	{object} 		event 				The onSettings event data
   * @param 	{object} 		event.oldSettings 	The old settings object
   * @param 	{object} 		event.newSettings 	The new settings object
   * @param 	{string[]} 		event.changedKeys 	An array of keys changed since the previous version
   * @returns {Promise<string|void>} 				Return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    await super.onSettings({ oldSettings, newSettings, changedKeys });
    this.log('energyAccount Device:onSettings - settings were changed');
  }

  /**
   * onSettingsChanged is called to complete the user's updates to the device's settings.
   * @param  	{object} 			event 				The onSettings event data
   * @param  	{object} 			event.oldSettings 	The old settings object
   * @param  	{object} 			event.newSettings 	The new settings object
   * @param  	{string[]} 			event.changedKeys 	An array of keys changed since the previous version
   * @returns {Promise<string|void>}	Return a custom message that will be displayed
   */
  async onSettingsChanged({ oldSettings, newSettings, changedKeys }) {
    await super.onSettingsChanged({ oldSettings, newSettings, changedKeys });
    if (changedKeys.includes('periodStartDay')) {
      this.homey.log(`energyAccount Device:onSettingsChanged - periodStartDay changed to ${newSettings.periodStartDay}`);
      await this.updatePeriodDay(newSettings.periodStartDay);
    }
    this.log('energyAccount Device:onSettingsChanged - settings changes completed.');
  }

  /**
   * Ensure the set of store values is complete for each device
   * @returns {promise<void>}
   */
  async migrateStore() {
    await super.migrateStore();
    const keys = this.getStoreKeys();

    if (!keys.includes("hasExport")) {
      const hasExport = this.hasCapability("meter_power.export");
      await this.setStoreValue("hasExport", hasExport);
    }
  }

  /**
   * Indicate if the current product tariff is an export product tariff
   * @returns {boolean}           True if the product tariff is export, false otherwise
   */
  get hasExport() {
    const hasExport = this.getStoreValue("hasExport");
    return hasExport;
  }

  /**
   * Set the total number of minutes dispatched today
   * @param {number}  minutes The total number of minutes dispatched today
   */
  set dispatchMinutes(minutes) {
    this.#dispatchMinutes = minutes;
  }

  /**
   * Get the total number of minutes dispatched today
   * @returns {number}  The total number of minutes dispatched today
   */
  get dispatchMinutes() {
    return this.#dispatchMinutes ?? 0;
  }

  /**
   * Update capability values that depend on the period day to be consistent
   * @param   {integer}   startDay    The day number of the period start (1-31)
   * @returns {Promise<boolean>}      Indicates if any capabilities are actually updated
   */
  async updatePeriodDay(startDay) {
    this.homey.log(`energyAccount Device:updatePeriodDay - updating period start day to ${startDay}`);
    const atTimeMillis = dayjs().tz(this.wrapper.timeZone).valueOf();
    const periodDay = this.computePeriodDay(atTimeMillis, Number(startDay));
    const periodStartDate = this.computePeriodStartDate(atTimeMillis, startDay);
    const nextStartDate = periodStartDate.add(1, 'month');
    const periodLength = nextStartDate.diff(periodStartDate, 'days');

    this.updateCapability(this._capIds.PERIOD_DAY_NUMBER, periodDay);
    this.updateCapability(this._capIds.PERIOD_START_TEXT, periodStartDate.format('YYYY-MM-DD'));
    this.updateCapability(this._capIds.PERIOD_NEXT_START_TEXT, nextStartDate.format('YYYY-MM-DD'));
    this.updateCapability(this._capIds.PERIOD_DURATION, periodLength);

    const updates = await this.updateCapabilities(false);
    return updates;
  }

  /**
   * For a given date compute the number of the day in the period 
   * @param   {number}    atTimeMillis      Date in epoch milliseconds to compute the period day for
   * @param   {integer}   periodStartDay    The day in month when the period starts 
   * @returns {integer}                     The 1-based index into the period of the date
   */
  computePeriodDay(atTimeMillis, periodStartDay) {
    const eventDateTime = dayjs(atTimeMillis).tz(this.wrapper.timeZone).startOf('day');
    const periodStartDate = this.computePeriodStartDate(atTimeMillis, periodStartDay);
    const periodDay = 1 + eventDateTime.diff(periodStartDate, 'days');
    return periodDay;
  }

  /**
   * Compute the start date of the period
   * @param   {number}    atTimeMillis      Event time in milliseconds since the epoch
   * @param   {integer}   periodStartDay    The day in month when the period starts 
   * @returns {dayjs}                     The start date of the period
   */
  computePeriodStartDate(atTimeMillis, periodStartDay) {
    const eventDateTime = dayjs(atTimeMillis).tz(this.wrapper.timeZone).startOf('day');
    const currentDay = eventDateTime.date();
    const periodStartDate = (currentDay < periodStartDay) ?
      eventDateTime.subtract(1, 'month').date(Number(periodStartDay)) :
      eventDateTime.date(Number(periodStartDay));
    this.log(`energyAccount.computePeriodStartDate: periodStartDate ${periodStartDate.toISOString()}`)
    return periodStartDate;
  }

  /**
   * Compute the length of the period that includes the specified date in days
   * @param   {number}    atTimeMillis      Datetime in milliseconds since the epoch to be included in the period
   * @param   {integer}   periodStartDay    The day in month when the period starts 
   * @returns {integer}                     The length of the period
   */
  computePeriodLength(atTimeMillis, periodStartDay) {
    const periodStartDate = this.computePeriodStartDate(atTimeMillis, periodStartDay);
    const periodEndDate = periodStartDate.add(1, 'month');
    const length = periodEndDate.diff(periodStartDate, 'days');
    this.homey.log(`energyAccount.computePeriodLength: periodLength ${length}`);
    return length;
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
    const lastEventTime = this.driver.homey.app.eventTime;
    const newPeriod = periodChanges.invoicePeriod;
    const newChunk = periodChanges.chunk;
    const newDay = periodChanges.day;
    const timeZone = this.wrapper.timeZone;
    const eventDateTime = dayjs(atTimeMillis).tz(timeZone);
    const firstTime = (null === this.readCapabilityValue(this._capIds.IMPORT_READING));
    const billingPeriodStartDay = this.getSettings().periodStartDay;
    let currentPeriodStartDate = this.computePeriodStartDate(atTimeMillis, billingPeriodStartDay);
    let nextPeriodStartDate = currentPeriodStartDate.add(1, 'month');
    this.log(`energyAccount.processEvent: currentPeriodStartDate ${currentPeriodStartDate.toISOString()}, nextPeriodStartDate ${nextPeriodStartDate.toISOString()}`)

    const periodLength = this.computePeriodLength(atTimeMillis, billingPeriodStartDay);

    const currentDispatches = this.getAnyPricingDispatches(atTimeMillis, plannedDispatches)
    const inExtendedDispatch = currentDispatches.length > 0;

    const minPrice = importTariff.minimumPriceToday;
    const currentBalance = (!!account) ? .01 * account.balance : this.readCapabilityValue(this._capIds.ACCOUNT_BALANCE);
    const exportTariffPresent = exportTariff.present;
    const importTariffPresent = importTariff.present;

    const periodStandingCharge = firstTime ? 0 : this.readCapabilityValue(this._capIds.PERIOD_STANDING_CHARGE);
    const currentExport = 1000 * this.readCapabilityValue(this._capIds.EXPORT_READING);								//watt hours
    const periodCurrentExport = 1000 * this.readCapabilityValue(this._capIds.PERIOD_EXPORT_ENERGY);		//watt hours
    const periodCurrentExportValue = this.readCapabilityValue(this._capIds.PERIOD_EXPORT_VALUE);			//pounds
    const dayCurrentExport = 1000 * this.readCapabilityValue(this._capIds.DAY_EXPORT_ENERGY);					//watt hours
    const dayCurrentExportValue = this.readCapabilityValue(this._capIds.DAY_EXPORT_VALUE);						//pounds
    const chunkCurrentExport = 1000 * this.readCapabilityValue(this._capIds.CHUNK_EXPORT_ENERGY);			//watt hours
    const chunkCurrentExportValue = this.readCapabilityValue(this._capIds.CHUNK_EXPORT_VALUE);				//pounds
    const priorExportPricePaid = this.readCapabilityValue(this._capIds.PRIOR_EXPORT_PRICE_PAID);			//pounds

    const currentImport = 1000 * this.readCapabilityValue(this._capIds.IMPORT_READING);								//watt hours
    const periodCurrentImport = 1000 * this.readCapabilityValue(this._capIds.PERIOD_IMPORT_ENERGY);		//watt hours
    const periodCurrentImportValue = this.readCapabilityValue(this._capIds.PERIOD_IMPORT_VALUE);			//pounds
    const dayCurrentImport = 1000 * this.readCapabilityValue(this._capIds.DAY_IMPORT_ENERGY);					//watt hours
    const dayCurrentImportValue = this.readCapabilityValue(this._capIds.DAY_IMPORT_VALUE);						//pounds
    const chunkCurrentImport = 1000 * this.readCapabilityValue(this._capIds.CHUNK_IMPORT_ENERGY);			//watt hours
    const chunkCurrentImportValue = this.readCapabilityValue(this._capIds.CHUNK_IMPORT_VALUE);				//pounds
    const priorImportPricePaid = this.readCapabilityValue(this._capIds.PRIOR_IMPORT_PRICE_PAID);			//pounds

    const periodDay = this.computePeriodDay(atTimeMillis, billingPeriodStartDay);

    let deltaExport = 0;
    let deltaExportValue = 0;
    let periodUpdatedExport = 0;
    let periodUpdatedExportValue = 0;
    let dayUpdatedExport = 0;
    let dayUpdatedExportValue = 0;
    let dayExportStandingCharge = 0;
    let deltaImport = 0;
    let deltaImportValue = 0;
    let periodUpdatedImport = 0;
    let periodUpdatedImportValue = 0;
    let dayUpdatedImport = 0;
    let dayUpdatedImportValue = 0;
    let dayImportStandingCharge = 0;
    let chunkUpdatedImport = 0;
    let chunkUpdatedImportValue = 0;
    let chunkUpdatedExport = 0;
    let chunkUpdatedExportValue = 0;
    let powerImport = 0;
    let powerExport = 0;
    let periodUpdatedStandingCharge = periodStandingCharge;
    let billValue = 0;
    let projectedBill = null;
    let importPrice = 0;
    let exportPrice = 0;

    //TODO: Unify logic in productTarrif and energyAccount for handling dispatch pricing
    const smartDispatches = Object.values(plannedDispatches).flat().filter(dispatch => dispatch.type === 'SMART');
    const dispatchMinutesIncrement = this.wrapper.countDispatchMinutes(smartDispatches, lastEventTime, atTimeMillis);
    this.dispatchMinutes = dispatchMinutesIncrement + (newDay ? 0 : this.dispatchMinutes);
    const dispatchPricing = inExtendedDispatch && (this.dispatchMinutes < this.getSettings().dispatchMinutesLimit);

    let observedDays = firstTime ? 0 : this.readCapabilityValue(this._capIds.OBSERVED_DAYS);
    observedDays += newDay ? 1 : 0;

    if (newPeriod) {
      //currentPeriodStartDate = nextPeriodStartDate;
      //nextPeriodStartDate = nextPeriodStartDate.plus({ months: 1 });
      observedDays = 0;
    }

    this.log(`energyAccount.processEvent: currentPeriodStartDate ${currentPeriodStartDate.toISOString()}, nextPeriodStartDate ${nextPeriodStartDate.toISOString()}`)

    if (!firstTime) {
      if (exportTariffPresent) {
        exportPrice = .01 * exportTariff.unitRate;																									//pounds
        deltaExport = liveMeterReading.export - currentExport;																			//watt hours
        //The prior price received is used to calculate the value of the energy exported in the previous tick
        deltaExportValue = (deltaExport / 1000) * priorExportPricePaid;															//pounds
        periodUpdatedExport = deltaExport + (newPeriod ? 0 : periodCurrentExport);									//watt hours
        periodUpdatedExportValue = deltaExportValue + (newPeriod ? 0 : periodCurrentExportValue);		//pounds
        dayUpdatedExport = deltaExport + (newDay ? 0 : dayCurrentExport);														//watt hours
        dayUpdatedExportValue = deltaExportValue + (newDay ? 0 : dayCurrentExportValue);						//pounds
        dayExportStandingCharge = exportTariff.standingCharge;																			//pence
        chunkUpdatedExport = deltaExport + (newChunk ? 0 : chunkCurrentExport);											//watt hours
        chunkUpdatedExportValue = deltaExportValue + (newChunk ? 0 : chunkCurrentExportValue);			//pounds
        powerExport = deltaExport * 60 / eventInterval;			                                        //watts
      }

      if (importTariffPresent) {
        //TODO: Add boost pricing here.
        importPrice = .01 * (dispatchPricing ? minPrice : importTariff.unitRate);										//pounds	
        deltaImport = liveMeterReading.consumption - currentImport;																	//watt hours
        //The prior price paid is used to calculate the value of the energy consumed in the previous tick
        deltaImportValue = (deltaImport / 1000) * priorImportPricePaid;															//pounds
        periodUpdatedImport = deltaImport + (newPeriod ? 0 : periodCurrentImport);									//watt hours
        periodUpdatedImportValue = deltaImportValue + (newPeriod ? 0 : periodCurrentImportValue);		//pounds
        dayUpdatedImport = deltaImport + (newDay ? 0 : dayCurrentImport);														//watt hours
        dayUpdatedImportValue = deltaImportValue + (newDay ? 0 : dayCurrentImportValue);						//pounds
        dayImportStandingCharge = importTariff.standingCharge;																			//pence
        chunkUpdatedImport = deltaImport + (newChunk ? 0 : chunkCurrentImport);											//watt hours
        chunkUpdatedImportValue = deltaImportValue + (newChunk ? 0 : chunkCurrentImportValue);			//pounds
        powerImport = deltaImport * 60 / eventInterval;                                             //watts
      }

      if (newDay) {
        periodUpdatedStandingCharge = (newPeriod ? 0 : periodStandingCharge) + (
          .01 * (dayExportStandingCharge + dayImportStandingCharge)
        );
      }

      billValue = periodUpdatedStandingCharge + periodUpdatedImportValue - periodUpdatedExportValue;
      if (observedDays > 0) {
        const startOfDay = eventDateTime.startOf('day');
        const fractionOfDay = (eventDateTime - startOfDay) / (24 * 60 * 60 * 1000);
        const observedFraction = observedDays + fractionOfDay;
        const dayStandingCharge = .01 * (dayExportStandingCharge + dayImportStandingCharge);
        const aveDaySpend = dayStandingCharge + (periodUpdatedImportValue - periodUpdatedExportValue) / observedFraction;
        projectedBill = aveDaySpend * periodLength;
      }
    } else {
      periodUpdatedStandingCharge = .01 * periodDay * (
        (exportTariffPresent ? exportTariff.standingCharge : 0) +
        (importTariffPresent ? importTariff.standingCharge : 0)
      );
    }

    this.homey.log(`energyAccount.processEvent: periodDay: ${periodDay}, periodUpdatedStandingCharge: ${periodUpdatedStandingCharge}`);


    this.updateCapability(this._capIds.PERIOD_DAY_NUMBER, periodDay);
    this.updateCapability(this._capIds.PERIOD_DURATION, periodLength);
    this.updateCapability(this._capIds.ACCOUNT_BALANCE, currentBalance);
    this.updateCapability(this._capIds.PROJECTED_BILL, projectedBill);
    this.updateCapability(this._capIds.PERIOD_START_TEXT, currentPeriodStartDate.format("YYYY-MM-DD"));
    this.updateCapability(this._capIds.PERIOD_NEXT_START_TEXT, nextPeriodStartDate.format("YYYY-MM-DD"));
    this.updateCapability(this._capIds.IMPORT_READING, liveMeterReading.consumption / 1000);
    this.updateCapability(this._capIds.EXPORT_READING, liveMeterReading.export / 1000);
    this.updateCapability(this._capIds.PERIOD_IMPORT_ENERGY, periodUpdatedImport / 1000);
    this.updateCapability(this._capIds.PERIOD_EXPORT_ENERGY, periodUpdatedExport / 1000);
    this.updateCapability(this._capIds.PERIOD_IMPORT_VALUE, periodUpdatedImportValue);
    this.updateCapability(this._capIds.PERIOD_EXPORT_VALUE, periodUpdatedExportValue);
    this.updateCapability(this._capIds.PERIOD_STANDING_CHARGE, periodUpdatedStandingCharge);
    this.updateCapability(this._capIds.PERIOD_BILL, billValue);
    this.updateCapability(this._capIds.DAY_IMPORT_ENERGY, dayUpdatedImport / 1000);
    this.updateCapability(this._capIds.DAY_EXPORT_ENERGY, dayUpdatedExport / 1000);
    this.updateCapability(this._capIds.DAY_IMPORT_VALUE, dayUpdatedImportValue);
    this.updateCapability(this._capIds.DAY_EXPORT_VALUE, dayUpdatedExportValue);
    this.updateCapability(this._capIds.CHUNK_IMPORT_ENERGY, chunkUpdatedImport / 1000);
    this.updateCapability(this._capIds.CHUNK_EXPORT_ENERGY, chunkUpdatedExport / 1000);
    this.updateCapability(this._capIds.CURRENT_IMPORT_POWER, powerImport);
    this.updateCapability(this._capIds.CURRENT_EXPORT_POWER, powerExport);
    this.updateCapability(this._capIds.CHUNK_IMPORT_VALUE, chunkUpdatedImportValue);
    this.updateCapability(this._capIds.CHUNK_EXPORT_VALUE, chunkUpdatedExportValue);
    this.updateCapability(this._capIds.OBSERVED_DAYS, observedDays);
    this.updateCapability(this._capIds.PRIOR_IMPORT_PRICE_PAID, importPrice);
    this.updateCapability(this._capIds.PRIOR_EXPORT_PRICE_PAID, exportPrice);
    this.updateCapability(this._capIds.NET_POWER, powerImport - powerExport);

    return updates;
  }

}