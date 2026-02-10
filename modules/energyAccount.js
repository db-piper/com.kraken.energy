'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class energyAccount extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('energyAccount Device:onInit - energyAccount device has been initialized');
		await super.onInit();

		if (this.hasCapability("measure_monetary.chunk_accumulated_value")) {
			this.log(`energyAccount Device:onInit - Old capability detected, reset all capabilities`);
			await this.applyCapabilities();
		}

		const isDispatchable = (await this.accountWrapper.getDeviceIds()).length > 0;
		const hasExport = (await this.accountWrapper.getTariffDirection(true)) !== undefined;

		this.log(`energyAccount Device:onInit - isDispatchable ${isDispatchable}`);
		this.defineCapability("date_time.period_start", { "title": { "en": "This Period Start" } });
		this.defineCapability("date_time.next_period_start", { "title": { "en": "Next Start Day" } });
		this.defineCapability("period_day.period_day");
		this.defineCapability("period_day.period_duration", { "title": { "en": "Period Duration" } });
		this.defineCapability("measure_monetary.account_balance", { "title": { "en": "Account Balance" }, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.projected_bill", { "title": { "en": "Projected Bill" }, "units": { "en": "£" } });
		this.defineCapability("meter_power.import", { "title": { "en": "Import Reading" }, "decimals": 3 });
		this.defineCapability("meter_power.export", { "title": { "en": "Export Reading" }, "decimals": 3 }, [], hasExport);
		this.defineCapability("meter_power.period_import", { "title": { "en": "Period Import" }, "decimals": 3 });
		this.defineCapability("meter_power.period_export", { "title": { "en": "Period Export" }, "decimals": 3 }, [], hasExport);
		this.defineCapability("measure_monetary.period_import_value", { "title": { "en": "Import Cost" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.period_export_value", { "title": { "en": "Export Value" }, "decimals": 2, "units": { "en": "£" } }, [], hasExport);
		this.defineCapability("measure_monetary.period_standing_charge", { "title": { "en": "Standing Charge" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.period_bill", { "title": { "en": "Bill Total" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("meter_power.day_import", { "title": { "en": "Day Import" }, "decimals": 3 });
		this.defineCapability("meter_power.day_export", { "title": { "en": "Day Export" }, "decimals": 3 }, [], hasExport);
		this.defineCapability("measure_monetary.day_import_value", { "title": { "en": "Day Import Cost" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.day_export_value", { "title": { "en": "Day Export Value" }, "decimals": 2, "units": { "en": "£" } }, [], hasExport);
		this.defineCapability("meter_power.chunk_import", { "title": { "en": "Chunk Import" }, "decimals": 3 });
		this.defineCapability("meter_power.chunk_export", { "title": { "en": "Chunk Export" }, "decimals": 3 }, [], hasExport);
		this.defineCapability("measure_monetary.chunk_import_value", { "title": { "en": "Chunk Import Cost" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.chunk_export_value", { "title": { "en": "Chunk Export Value" }, "decimals": 2, "units": { "en": "£" } }, [], hasExport);
		this.defineCapability("measure_power.import_power", { "title": { "en": "Import Power" } });
		this.defineCapability("measure_power.export_power", { "title": { "en": "Export Power" } }, [], hasExport);
		this.defineCapability("date_time.full_period_start", { "title": { "en": "Full Start Date" }, "uiComponent": null });
		this.defineCapability("date_time.full_next_period", { "title": { "en": "Full Next Start" }, "uiComponent": null });
		this.defineCapability("item_count.observed_days", { "title": { "en": "Observed Days" }, "uiComponent": null, "decimals": 0 });

		await this.applyCapabilities();
		await this.applyStoreValues();

		await this.updatePeriodDay(this._settings.periodStartDay);
	}

	/**
	 * onAdded is called when the user adds the device, called just after pairing.
	 */
	async onAdded() {
		this.log('energyAccount Device:onAdded - has been added');
	}

	/**
	 * onRenamed is called when the user updates the device's name.
	 * This method can be used this to synchronise the name to the device.
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
	 * Update capability values that depend on the period day to be consistent
	 * @param   {integer}   startDay    The day number of the period start (1-31)
	 * @returns {Promise<boolean>}      Indicates if any capabilities are actually updated
	 */
	async updatePeriodDay(startDay) {
		this.homey.log(`energyAccount Device:updatePeriodDay - updating period day to ${startDay}`);
		const atTime = (new Date()).toISOString();
		const periodDay = this.computePeriodDay(atTime, Number(startDay));
		const periodStartDate = this.computePeriodStartDate(atTime, startDay);
		const nextStartDate = this.computePeriodStartDate(periodStartDate.plus({ months: 1 }).toISO(), startDay);
		const periodLength = this.computePeriodLength(atTime, Number(startDay));

		this.updateCapability("period_day.period_day", periodDay);
		this.updateCapability("date_time.period_start", periodStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability("date_time.full_period_start", periodStartDate.toISO());
		this.updateCapability("date_time.next_period_start", nextStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability("date_time.full_next_period", nextStartDate.toISO());
		this.updateCapability("period_day.period_duration", periodLength);

		const updates = await this.updateCapabilities(false);
		return updates;
	}

	/**
	 * For a given date compute the number of the day in the period 
	 * @param   {string}    atTime            Date to compute period-day of
	 * @param   {integer}   periodStartDay    The day in month when the period starts 
	 * @returns {integer}                     The 1-based index into the period of the date
	 */
	computePeriodDay(atTime, periodStartDay) {
		const eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime)).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
		const periodStartDate = this.computePeriodStartDate(atTime, periodStartDay);
		const periodDay = 1 + eventDateTime.diff(periodStartDate, 'days').days;
		this.homey.log(`energyAccount.computePeriodDay: periodDay ${periodDay}`);
		return periodDay;
	}

	/**
	 * Compute the start date of the period
	 * @param   {string}    atTime            Date to compute period start from
	 * @param   {integer}   periodStartDay    The day in month when the period starts 
	 * @returns {DateTime}                    The start date of the period
	 */
	computePeriodStartDate(atTime, periodStartDay) {
		const eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime)).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
		const currentDay = eventDateTime.day;
		const periodStartDate = (currentDay < periodStartDay) ?
			eventDateTime.minus({ months: 1 }).set({ day: Number(periodStartDay) }) :
			eventDateTime.set({ day: Number(periodStartDay) });
		return periodStartDate;
	}

	/**
	 * Compute the length of the period that started on the specified date in days
	 * @param   {string}    atTime            Date to compute period length from
	 * @param   {integer}   periodStartDay    The day in month when the period starts 
	 * @returns {integer}                     The length of the period
	 */
	computePeriodLength(atTime, periodStartDay) {
		const periodStartDate = this.computePeriodStartDate(atTime, periodStartDay);
		const periodEndDate = periodStartDate.plus({ months: 1 });
		const length = periodEndDate.diff(periodStartDate, 'days').days;
		this.homey.log(`energyAccount.computePeriodLength: periodLength ${length}`);
		return length;
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

		let updates = await super.processEvent(atTime, newDay, liveMeterReading, plannedDispatches);

		const eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime));
		const firstTime = (null === this.getCapabilityValue("meter_power.import"));
		const billingPeriodStartDay = this._settings.periodStartDay;
		const periodLength = this.computePeriodLength(atTime, billingPeriodStartDay);

		const currentDispatch = this.getCurrentDispatch(atTime, plannedDispatches)
		const inDispatch = currentDispatch !== undefined;

		const minPrice = await this.accountWrapper.minimumPriceOnDate(atTime, false);							// Pence
		const currentBalance = this.accountWrapper.getCurrentBalance();
		const exportPrices = await this.accountWrapper.getTariffDirectionPrices(atTime, true);
		const exportTariffPresent = exportPrices !== undefined;
		const importPrices = await this.accountWrapper.getTariffDirectionPrices(atTime, false);
		const importTariffPresent = importPrices !== undefined;

		const currentExport = 1000 * this.getCapabilityValue("meter_power.export");						//watts
		const periodCurrentExport = 1000 * this.getCapabilityValue("meter_power.period_export");			//watts
		const periodCurrentExportValue = this.getCapabilityValue("measure_monetary.period_export_value"); //pounds
		const dayCurrentExport = 1000 * this.getCapabilityValue("meter_power.day_export");				//watts
		const dayCurrentExportValue = this.getCapabilityValue("measure_monetary.day_export_value");		//pounds
		const chunkCurrentExport = 1000 * this.getCapabilityValue("meter_power.chunk_export");			//watts
		const chunkCurrentExportValue = this.getCapabilityValue("measure_monetary.chunk_export_value");	//pounds

		const currentImport = 1000 * this.getCapabilityValue("meter_power.import");						//watts
		const periodCurrentImport = 1000 * this.getCapabilityValue("meter_power.period_import");			//watts
		const periodCurrentImportValue = this.getCapabilityValue("measure_monetary.period_import_value");	//pounds
		const dayCurrentImport = 1000 * this.getCapabilityValue("meter_power.day_import");				//watts
		const dayCurrentImportValue = this.getCapabilityValue("measure_monetary.day_import_value");		//pounds
		const chunkCurrentImport = 1000 * this.getCapabilityValue("meter_power.chunk_import");			//watts
		const chunkCurrentImportValue = this.getCapabilityValue("measure_monetary.chunk_import_value");	//pounds

		let currentPeriodStartDate = this.accountWrapper.getLocalDateTime(new Date(this.getCapabilityValue("date_time.full_period_start")));
		let nextPeriodStartDate = this.accountWrapper.getLocalDateTime(new Date(this.getCapabilityValue("date_time.full_next_period")));
		const newPeriod = eventDateTime >= nextPeriodStartDate;
		const newChunk = [0, 30].includes(eventDateTime.minute);
		const periodDay = this.computePeriodDay(atTime, billingPeriodStartDay);

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
		let periodUpdatedStandingCharge = 0;
		let billValue = 0;
		let projectedBill = null;
		let importPrice = 0;

		const totalDispatchMinutes = this.getTotalDispatchMinutes("item_count.dispatch_minutes");
		const dispatchPricing = inDispatch && (totalDispatchMinutes < this._settings.dispatchMinutesLimit);

		let observedDays = firstTime ? 0 : this.getCapabilityValue("item_count.observed_days");
		observedDays += newDay ? 1 : 0;
		this.homey.log(`energyAccount.processEvent: observedDays: ${observedDays}`);

		if (newPeriod) {
			this.homey.log(`energyAccount.processEvent: New period detected ${nextPeriodStartDate}`);
			currentPeriodStartDate = nextPeriodStartDate;
			nextPeriodStartDate = nextPeriodStartDate.plus({ months: 1 });
			observedDays = 0;
		}

		if (observedDays > 0) {
			const durationScale = periodLength / (1 + observedDays);
			projectedBill = billValue * durationScale;
			this.homey.log(`energyAccount.processEvent: durationScale: ${durationScale} projectedBill: ${projectedBill}`);
		}

		if (!firstTime) {
			if (exportTariffPresent) {
				deltaExport = liveMeterReading.export - currentExport;										//watts
				deltaExportValue = (deltaExport / 1000) * (exportPrices.unitRate / 100);					//pounds
				periodUpdatedExport = deltaExport + (newPeriod ? 0 : periodCurrentExport);					//watts
				periodUpdatedExportValue = deltaExportValue + (newPeriod ? 0 : periodCurrentExportValue);	//pounds
				dayUpdatedExport = deltaExport + (newDay ? 0 : dayCurrentExport);							//watts
				dayUpdatedExportValue = deltaExportValue + (newDay ? 0 : dayCurrentExportValue);			//pounds
				dayExportStandingCharge = exportPrices.standingCharge / 100;								//pounds
				chunkUpdatedExport = deltaExport + (newChunk ? 0 : chunkCurrentExport);						//watts
				chunkUpdatedExportValue = deltaExportValue + (newChunk ? 0 : chunkCurrentExportValue);		//pounds
				powerExport = deltaExport * 60;				//FREQ: 60 / pollinginterval					//watts
			}

			if (importTariffPresent) {
				importPrice = dispatchPricing ? minPrice : importPrices.unitRate;							//Pence	
				deltaImport = liveMeterReading.consumption - currentImport;									//watts
				deltaImportValue = (deltaImport / 1000) * (importPrice / 100);								//pounds
				periodUpdatedImport = deltaImport + (newPeriod ? 0 : periodCurrentImport);					//watts
				periodUpdatedImportValue = deltaImportValue + (newPeriod ? 0 : periodCurrentImportValue);	//pounds
				dayUpdatedImport = deltaImport + (newDay ? 0 : dayCurrentImport);
				this.homey.log(`energyAccount.processEvent: dayUpdatedImport: ${dayUpdatedImport} deltaImport: ${deltaImport}`);							//watts
				dayUpdatedImportValue = deltaImportValue + (newDay ? 0 : dayCurrentImportValue);			//pounds
				dayImportStandingCharge = importPrices.standingCharge;										//pounds
				chunkUpdatedImport = deltaImport + (newChunk ? 0 : chunkCurrentImport);						//watts
				chunkUpdatedImportValue = deltaImportValue + (newChunk ? 0 : chunkCurrentImportValue);		//pounds
				powerImport = deltaImport * 60;				//FREQ: 60 / pollinginterval 					//watts
			}

			const periodDay = this.getCapabilityValue("period_day.period_day");
			periodUpdatedStandingCharge = (.01 * (dayExportStandingCharge + dayImportStandingCharge)) * periodDay;
			billValue = periodUpdatedStandingCharge + periodUpdatedImportValue - periodUpdatedExportValue;

		}

		this.updateCapability("period_day.period_day", periodDay);
		this.updateCapability("period_day.period_duration", periodLength);
		this.updateCapability("measure_monetary.account_balance", currentBalance);
		this.updateCapability("measure_monetary.projected_bill", projectedBill);
		this.updateCapability("date_time.period_start", currentPeriodStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability("date_time.next_period_start", nextPeriodStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability("meter_power.import", liveMeterReading.consumption / 1000);
		this.updateCapability("meter_power.export", liveMeterReading.export / 1000);
		this.updateCapability("meter_power.period_import", periodUpdatedImport / 1000);
		this.updateCapability("meter_power.period_export", periodUpdatedExport / 1000);
		this.updateCapability("measure_monetary.period_import_value", periodUpdatedImportValue);
		this.updateCapability("measure_monetary.period_export_value", periodUpdatedExportValue);
		this.updateCapability("measure_monetary.period_standing_charge", periodUpdatedStandingCharge);
		this.updateCapability("measure_monetary.period_bill", billValue);
		this.updateCapability("meter_power.day_import", dayUpdatedImport / 1000);
		this.updateCapability("meter_power.day_export", dayUpdatedExport / 1000);
		this.updateCapability("measure_monetary.day_import_value", dayUpdatedImportValue);
		this.updateCapability("measure_monetary.day_export_value", dayUpdatedExportValue);
		this.updateCapability("meter_power.chunk_import", chunkUpdatedImport / 1000);
		this.updateCapability("meter_power.chunk_export", chunkUpdatedExport / 1000);
		this.updateCapability("measure_power.import_power", powerImport);
		this.updateCapability("measure_power.export_power", powerExport);
		this.updateCapability("measure_monetary.chunk_import_value", chunkUpdatedImportValue);
		this.updateCapability("measure_monetary.chunk_export_value", chunkUpdatedExportValue);
		this.updateCapability("date_time.full_period_start", currentPeriodStartDate.toISO());
		this.updateCapability("date_time.full_next_period", nextPeriodStartDate.toISO());
		this.updateCapability("item_count.observed_days", observedDays);

		updates = await this.updateCapabilities(updates);
		return updates;
	}

}