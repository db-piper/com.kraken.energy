'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class energyAccount extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('energyAccount Device:onInit - energyAccount Initialization Started');
		await super.onInit();

		if (this.hasCapability("measure_monetary.chunk_accumulated_value")) {
			this.log(`energyAccount Device:onInit - Old capability detected, reset all capabilities`);
			await this.applyCapabilities();
		}

		const hasExport = this.hasExport;

		this.defineCapability(this._capIds.PERIOD_START_TEXT, { "title": { "en": "This Period Start" } });
		this.defineCapability(this._capIds.PERIOD_NEXT_START_TEXT, { "title": { "en": "Next Start Day" } });
		this.defineCapability(this._capIds.PERIOD_DAY_NUMBER, { "title": { "en": "Period Day Number" } });
		this.defineCapability(this._capIds.PERIOD_DURATION, { "title": { "en": "Period Duration" } });
		this.defineCapability(this._capIds.ACCOUNT_BALANCE, { "title": { "en": "Account Balance" }, "units": { "en": "£" } });
		this.defineCapability(this._capIds.PROJECTED_BILL, { "title": { "en": "Projected Bill" }, "units": { "en": "£" } });
		this.defineCapability(this._capIds.IMPORT_READING, { "title": { "en": "Import Reading" }, "decimals": 3 });
		this.defineCapability(this._capIds.EXPORT_READING, { "title": { "en": "Export Reading" }, "decimals": 3 }, [], hasExport);
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
		this.defineCapability(this._capIds.PERIOD_START_DATETIME, { "title": { "en": "Full Start Date" }, "uiComponent": null });
		this.defineCapability(this._capIds.PERIOD_NEXT_START_DATETIME, { "title": { "en": "Full Next Start" }, "uiComponent": null });
		this.defineCapability(this._capIds.OBSERVED_DAYS, { "title": { "en": "Observed Days" }, "uiComponent": null, "decimals": 0 });

		await this.applyCapabilities();
		await this.applyStoreValues();

		await this.updatePeriodDay(this.getSettings().periodStartDay);
		this.log('energyAccount Device:onInit - energyAccount Initialization Completed');
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
	 * Update capability values that depend on the period day to be consistent
	 * @param   {integer}   startDay    The day number of the period start (1-31)
	 * @returns {Promise<boolean>}      Indicates if any capabilities are actually updated
	 */
	async updatePeriodDay(startDay) {
		this.homey.log(`energyAccount Device:updatePeriodDay - updating period start day to ${startDay}`);
		const atTime = (new Date()).toISOString();
		const periodDay = this.computePeriodDay(atTime, Number(startDay));
		const periodStartDate = this.computePeriodStartDate(atTime, startDay);
		const nextStartDate = this.computePeriodStartDate(periodStartDate.plus({ months: 1 }).toISO(), startDay);
		const periodLength = this.computePeriodLength(atTime, Number(startDay));

		this.updateCapability(this._capIds.PERIOD_DAY_NUMBER, periodDay);
		this.updateCapability(this._capIds.PERIOD_START_TEXT, periodStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability(this._capIds.PERIOD_START_DATETIME, periodStartDate.toISO());
		this.updateCapability(this._capIds.PERIOD_NEXT_START_TEXT, nextStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability(this._capIds.PERIOD_NEXT_START_DATETIME, nextStartDate.toISO());
		this.updateCapability(this._capIds.PERIOD_DURATION, periodLength);

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
	processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = {}, accountData = undefined) {

		let updates = super.processEvent(atTime, newDay, liveMeterReading, plannedDispatches, accountData);

		const eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime));
		const firstTime = (null === this.readCapabilityValue(this._capIds.IMPORT_READING));
		const billingPeriodStartDay = this.getSettings().periodStartDay;
		const periodLength = this.computePeriodLength(atTime, billingPeriodStartDay);

		const currentDispatch = this.getCurrentDispatch(atTime, plannedDispatches)
		const inDispatch = currentDispatch !== undefined;

		const minPrice = this.accountWrapper.minimumPriceOnDate(atTime, false, accountData);							// Pence
		const currentBalance = this.accountWrapper.getCurrentBalance(accountData);
		const exportPrices = this.accountWrapper.getTariffDirectionPrices(atTime, true, accountData);
		const exportTariffPresent = exportPrices !== undefined;
		const importPrices = this.accountWrapper.getTariffDirectionPrices(atTime, false, accountData);
		const importTariffPresent = importPrices !== undefined;

		const currentExport = 1000 * this.readCapabilityValue(this._capIds.EXPORT_READING);								//watts
		const periodCurrentExport = 1000 * this.readCapabilityValue(this._capIds.PERIOD_EXPORT_ENERGY);		//watts
		const periodCurrentExportValue = this.readCapabilityValue(this._capIds.PERIOD_EXPORT_VALUE);			//pounds
		const dayCurrentExport = 1000 * this.readCapabilityValue(this._capIds.DAY_EXPORT_ENERGY);					//watts
		const dayCurrentExportValue = this.readCapabilityValue(this._capIds.DAY_EXPORT_VALUE);						//pounds
		const chunkCurrentExport = 1000 * this.readCapabilityValue(this._capIds.CHUNK_EXPORT_ENERGY);			//watts
		const chunkCurrentExportValue = this.readCapabilityValue(this._capIds.CHUNK_EXPORT_VALUE);				//pounds

		const currentImport = 1000 * this.readCapabilityValue(this._capIds.IMPORT_READING);								//watts
		const periodCurrentImport = 1000 * this.readCapabilityValue(this._capIds.PERIOD_IMPORT_ENERGY);		//watts
		const periodCurrentImportValue = this.readCapabilityValue(this._capIds.PERIOD_IMPORT_VALUE);			//pounds
		const dayCurrentImport = 1000 * this.readCapabilityValue(this._capIds.DAY_IMPORT_ENERGY);					//watts
		const dayCurrentImportValue = this.readCapabilityValue(this._capIds.DAY_IMPORT_VALUE);						//pounds
		const chunkCurrentImport = 1000 * this.readCapabilityValue(this._capIds.CHUNK_IMPORT_ENERGY);			//watts
		const chunkCurrentImportValue = this.readCapabilityValue(this._capIds.CHUNK_IMPORT_VALUE);				//pounds

		let currentPeriodStartDate = this.accountWrapper.getLocalDateTime(new Date(this.readCapabilityValue(this._capIds.PERIOD_START_DATETIME)));
		let nextPeriodStartDate = this.accountWrapper.getLocalDateTime(new Date(this.readCapabilityValue(this._capIds.PERIOD_NEXT_START_DATETIME)));
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
		const dispatchPricing = inDispatch && (totalDispatchMinutes < this.getSettings().dispatchMinutesLimit);

		let observedDays = firstTime ? 0 : this.readCapabilityValue(this._capIds.OBSERVED_DAYS);
		observedDays += newDay ? 1 : 0;
		this.homey.log(`energyAccount.processEvent: observedDays: ${observedDays}`);

		if (newPeriod) {
			this.homey.log(`energyAccount.processEvent: New period detected ${nextPeriodStartDate}`);
			currentPeriodStartDate = nextPeriodStartDate;
			nextPeriodStartDate = nextPeriodStartDate.plus({ months: 1 });
			observedDays = 0;
		}

		if (!firstTime) {
			if (exportTariffPresent) {
				deltaExport = liveMeterReading.export - currentExport;																			//watts
				deltaExportValue = (deltaExport / 1000) * (exportPrices.unitRate / 100);										//pounds
				periodUpdatedExport = deltaExport + (newPeriod ? 0 : periodCurrentExport);									//watts
				periodUpdatedExportValue = deltaExportValue + (newPeriod ? 0 : periodCurrentExportValue);		//pounds
				dayUpdatedExport = deltaExport + (newDay ? 0 : dayCurrentExport);														//watts
				dayUpdatedExportValue = deltaExportValue + (newDay ? 0 : dayCurrentExportValue);						//pounds
				dayExportStandingCharge = exportPrices.standingCharge;																			//pence
				chunkUpdatedExport = deltaExport + (newChunk ? 0 : chunkCurrentExport);											//watts
				chunkUpdatedExportValue = deltaExportValue + (newChunk ? 0 : chunkCurrentExportValue);			//pounds
				powerExport = deltaExport * 60;				//FREQ: 60 / pollinginterval													//watts
			}

			if (importTariffPresent) {
				importPrice = dispatchPricing ? minPrice : importPrices.unitRate;														//Pence	
				deltaImport = liveMeterReading.consumption - currentImport;																	//watts
				deltaImportValue = (deltaImport / 1000) * (importPrice / 100);															//pounds
				periodUpdatedImport = deltaImport + (newPeriod ? 0 : periodCurrentImport);									//watts
				periodUpdatedImportValue = deltaImportValue + (newPeriod ? 0 : periodCurrentImportValue);		//pounds
				dayUpdatedImport = deltaImport + (newDay ? 0 : dayCurrentImport);														//watts
				this.homey.log(`energyAccount.processEvent: dayUpdatedImport: ${dayUpdatedImport} deltaImport: ${deltaImport}`);							//watts
				dayUpdatedImportValue = deltaImportValue + (newDay ? 0 : dayCurrentImportValue);						//pounds
				dayImportStandingCharge = importPrices.standingCharge;																			//pence
				chunkUpdatedImport = deltaImport + (newChunk ? 0 : chunkCurrentImport);											//watts
				chunkUpdatedImportValue = deltaImportValue + (newChunk ? 0 : chunkCurrentImportValue);			//pounds
				powerImport = deltaImport * 60;				//FREQ: 60 / pollinginterval 													//watts
			}

			const periodDay = this.readCapabilityValue(this._capIds.PERIOD_DAY_NUMBER);
			const dailyStandingCharge = .01 * (dayExportStandingCharge + dayImportStandingCharge);
			periodUpdatedStandingCharge = dailyStandingCharge * periodDay;
			billValue = periodUpdatedStandingCharge + periodUpdatedImportValue - periodUpdatedExportValue;
			this.homey.log(`energyAccount.processEvent: billValue: ${billValue} periodUpdatedImportValue: ${periodUpdatedImportValue} periodUpdatedExportValue: ${periodUpdatedExportValue} periodUpdatedStandingCharge: ${periodUpdatedStandingCharge}`);
			if (observedDays > 0) {
				const startOfDay = eventDateTime.startOf('day');
				const fractionOfDay = eventDateTime.diff(startOfDay, "milliseconds") / (24 * 60 * 60 * 1000);
				const observedFraction = observedDays + fractionOfDay;
				const aveDaySpend = dailyStandingCharge + (periodUpdatedImportValue - periodUpdatedExportValue) / observedFraction;
				projectedBill = aveDaySpend * periodLength;
				this.homey.log(`energyAccount.processEvent: observedFraction: ${observedFraction} aveDaySpend: ${aveDaySpend} periodLength: ${periodLength} projectedBill: ${projectedBill}`);
			}

		}

		this.updateCapability(this._capIds.PERIOD_DAY_NUMBER, periodDay);
		this.updateCapability(this._capIds.PERIOD_DURATION, periodLength);
		this.updateCapability(this._capIds.ACCOUNT_BALANCE, currentBalance);
		this.updateCapability(this._capIds.PROJECTED_BILL, projectedBill);
		this.updateCapability(this._capIds.PERIOD_START_TEXT, currentPeriodStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability(this._capIds.PERIOD_NEXT_START_TEXT, nextPeriodStartDate.toFormat("yyyy-LL-dd"));
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
		this.updateCapability(this._capIds.PERIOD_START_DATETIME, currentPeriodStartDate.toISO());
		this.updateCapability(this._capIds.PERIOD_NEXT_START_DATETIME, nextPeriodStartDate.toISO());
		this.updateCapability(this._capIds.OBSERVED_DAYS, observedDays);

		return updates;
	}

}