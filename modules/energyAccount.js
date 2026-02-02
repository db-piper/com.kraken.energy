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

		const isHalfHourly = await this.accountWrapper.isHalfHourly(false);
		const isDispatchable = (await this.accountWrapper.getDeviceIds()).length > 0;
		const hasExport = (await this.accountWrapper.getTariffDirection(true)) !== undefined;

		this.log(`energyAccount Device:onInit - isDispatchable ${isDispatchable}`);
		//this.defineCapability("month_day.period_start", { "title": { "en": "Period Start Day" } });  //Enum, drop list interface
		this.defineCapability("date_time.period_start", { "title": { "en": "This Period Start" } });
		this.defineCapability("date_time.next_period_start", { "title": { "en": "Next Start Day" } });
		this.defineCapability("period_day.period_start", { "title": { "en": "Period Start Day" }, "uiComponent": "slider", "setable": true, "units": { "en": "Day" } });
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
		this.defineCapability("data_presence.dispatch_pricing", { "title": { "en": "Dispatch Pricing" } }, [], isDispatchable);
		this.defineCapability("percent.dispatch_limit", { "title": { "en": "Dispatch Limit" }, "decimals": 1, "units": { "en": "%" } }, ['title', 'decimals'], isDispatchable);
		this.defineCapability("slot_quartile", { "title": { "en": "Price Quartile" } }, [], isHalfHourly);
		this.defineCapability("date_time.full_period_start", { "title": { "en": "Full Start Date" }, "uiComponent": null });
		this.defineCapability("date_time.full_next_period", { "title": { "en": "Full Next Start" }, "uiComponent": null });

		await this.applyCapabilities();
		await this.applyStoreValues();

		const settings = await this.getSettings();
		this.log(`energyAccount Device:onInit - DeviceSettings: ${JSON.stringify(settings)}`);

		this.homey.log(`energyAccount.onInit: Registering capability listener.`);
		// this.registerCapabilityListener('month_day.period_start', async (value, opts) => {
		// 	await this.updatePeriodDay(value);
		// });
		this.registerCapabilityListener('period_day.period_start', async (value, opts) => {
			await this.updatePeriodDay(value);
		});

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
	 * @param 	{object} 		event 						 	The onSettings event data
	 * @param 	{object} 		event.oldSettings 	The old settings object
	 * @param 	{object} 		event.newSettings 	The new settings object
	 * @param 	{string[]} 	event.changedKeys 	An array of keys changed since the previous version
	 * @returns {Promise<string|void>} 					Return a custom message that will be displayed
	 */
	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.log('energyAccount Device:onSettings - settings were changed');
	}

	/**
	 * Update capability values that depend on the period day to be consistent
	 * @param   {integer}   startDay    The day number of the period start (1-31)
	 * @returns {Promise<boolean>}      Indicates if any capabilities are actually updated
	 */
	async updatePeriodDay(startDay) {
		const atTime = (new Date()).toISOString();
		const periodDay = this.computePeriodDay(atTime, Number(startDay));
		const periodStartDate = this.computePeriodStartDate(atTime, startDay);
		const nextStartDate = this.computePeriodStartDate(periodStartDate.plus({ months: 1 }).toISO(), startDay);

		this.updateCapability("period_day.period_day", periodDay);
		this.updateCapability("date_time.period_start", periodStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability("date_time.full_period_start", periodStartDate.toISO());
		this.updateCapability("date_time.next_period_start", nextStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability("date_time.full_next_period", nextStartDate.toISO());

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
		const lastDay = periodStartDate.endOf('month').day;
		return lastDay;
	}

	/**
	 * Get the start date of the current period as stored in the named capability	
	 * @param   {string}    capabilityName    Name of the capability to get the start date from
	 * @param   {DateTime}  valueOnNull       Value to return if the capability is null
	 * @returns {DateTime}                    The start date of the period
	 */
	getPeriodStartDate(capabilityName, valueOnNull) {
		const dateString = this.getCapabilityValue(capabilityName);
		const date = (dateString === null) ? valueOnNull : this.accountWrapper.getLocalDateTime(new Date(dateString));
		return date.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
		//TODO: define and apply constant midnight in device.js
	}

	/**
	 * Initialise the billing period start day
	 * @param   {boolean}   firstTime       Indicates if this is the first time the device is being initialised
	 * @returns {Promise <integer>}         The billing period start day number within the month
	 */
	async initialiseBillingPeriodStartDay(firstTime) {
		let billingPeriodStartDay = await this.getCapabilityValue("period_day.period_start");
		if (firstTime) {
			this.homey.log(`energyAccount.initialiseBillingPeriodStartDay: firstTime ${firstTime}, billingPeriodStartDay ${billingPeriodStartDay}`);
			// billingPeriodStartDay = (this.accountWrapper.getBillingPeriodStartDay()).toString().padStart(2, '0');
			billingPeriodStartDay = this.accountWrapper.getBillingPeriodStartDay();
			try {
				await this.triggerCapabilityListener('period_day.period_start', billingPeriodStartDay, {});
				this.homey.log(`energyAccount.initialiseBillingPeriodStartDay: triggerCapabilityListener success`);
			} catch (error) {
				this.homey.log(`energyAccount.initialiseBillingPeriodStartDay: triggerCapabilityListener error`);
				if (error.message.includes('period_day.period_start')) {
					this.homey.log(`energyAccount.initialiseBillingPeriodStartDay: registering capability listener`);
					this.registerCapabilityListener('period_day.period_start', async (value, opts) => {
						await this.updatePeriodDay(value);
					});
					await this.updatePeriodDay(billingPeriodStartDay);
				}
			}
		}
		return billingPeriodStartDay;
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

		const firstTime = (null === this.getCapabilityValue("meter_power.import"));
		const billingPeriodStartDay = await this.initialiseBillingPeriodStartDay(firstTime);
		const periodLength = this.computePeriodLength(atTime, Number(billingPeriodStartDay));
		this.homey.log(`energyAccount.processEvent: billingPeriodStart: ${billingPeriodStartDay} first: ${firstTime}`);

		const currentDispatch = this.getCurrentDispatch(atTime, plannedDispatches)
		const inDispatch = currentDispatch !== undefined;

		const minPrice = await this.accountWrapper.minimumPriceOnDate(atTime, false);							// Pence
		this.homey.log(`energyAccount.processEvent: currentDispatch ${JSON.stringify(currentDispatch)} inDispatch ${inDispatch} minPrice ${minPrice}`);
		const currentBalance = this.accountWrapper.getCurrentBalance();
		const exportPrices = await this.accountWrapper.getTariffDirectionPrices(atTime, true);
		const exportTariffPresent = exportPrices !== undefined;
		const importPrices = await this.accountWrapper.getTariffDirectionPrices(atTime, false);
		const importTariffPresent = importPrices !== undefined;


		const currentExport = 1000 * await this.getCapabilityValue("meter_power.export");						//watts
		const periodCurrentExport = 1000 * await this.getCapabilityValue("meter_power.period_export");			//watts
		const periodCurrentExportValue = await this.getCapabilityValue("measure_monetary.period_export_value"); //pounds
		const dayCurrentExport = 1000 * await this.getCapabilityValue("meter_power.day_export");				//watts
		const dayCurrentExportValue = await this.getCapabilityValue("measure_monetary.day_export_value");		//pounds
		const chunkCurrentExport = 1000 * await this.getCapabilityValue("meter_power.chunk_export");			//watts
		const chunkCurrentExportValue = await this.getCapabilityValue("measure_monetary.chunk_export_value");	//pounds

		const currentImport = 1000 * await this.getCapabilityValue("meter_power.import");						//watts
		const periodCurrentImport = 1000 * await this.getCapabilityValue("meter_power.period_import");			//watts
		const periodCurrentImportValue = await this.getCapabilityValue("measure_monetary.period_import_value");	//pounds
		const dayCurrentImport = 1000 * await this.getCapabilityValue("meter_power.day_import");				//watts
		const dayCurrentImportValue = await this.getCapabilityValue("measure_monetary.day_import_value");		//pounds
		const chunkCurrentImport = 1000 * await this.getCapabilityValue("meter_power.chunk_import");			//watts
		const chunkCurrentImportValue = await this.getCapabilityValue("measure_monetary.chunk_import_value");	//pounds

		let currentPeriodStartDate = this.getPeriodStartDate("date_time.full_period_start", this.computePeriodStartDate(atTime, billingPeriodStartDay));
		let nextPeriodStartDate = this.getPeriodStartDate("date_time.full_next_period", currentPeriodStartDate.plus({ months: 1 }));
		const eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime));

		const newPeriod = eventDateTime >= nextPeriodStartDate;
		this.homey.log(`energyAccount.processEvent: newPeriod ${newPeriod} eventDateTime ${eventDateTime.toISO()} nextPeriodStartDate ${nextPeriodStartDate.toISO()}`);
		const newChunk = [0, 30].includes(eventDateTime.minute);

		if (newPeriod) {
			this.homey.log(`energyAccount.processEvent: New period detected ${nextPeriodStartDate}`);
			currentPeriodStartDate = nextPeriodStartDate;
			nextPeriodStartDate = nextPeriodStartDate.plus({ months: 1 });
		}
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
		let periodUpdatedStandingCharge = 0;
		let billValue = 0;
		let projectedBill = 0;
		let importPrice = 0;
		let importQuartile = 0;

		let totalDispatchMinutes = 0;
		for (const device of this.driver.getDevices()) {
			if (device.getStoreValue("octopusClass") == "smartDevice") {
				totalDispatchMinutes += device.getCapabilityValue("item_count.dispatch_minutes");
				this.homey.log(`energyAccount.processEvent: device ${device.getName()} dispatchMinutes ${device.getCapabilityValue("item_count.dispatch_minutes")}`);
			}
		}
		const percentDispatchLimit = 100 * totalDispatchMinutes / this._MAX_DISPATCH_MINUTES;
		this.homey.log(`energyAccount.processEvent: percentDispatchLimit ${percentDispatchLimit} totalDispatchMinutes ${totalDispatchMinutes}`);

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
			}

			if (importTariffPresent) {
				importPrice = inDispatch ? minPrice : importPrices.unitRate;								//Pence	
				deltaImport = liveMeterReading.consumption - currentImport;									//watts
				deltaImportValue = (deltaImport / 1000) * (importPrice / 100);								//pounds
				periodUpdatedImport = deltaImport + (newPeriod ? 0 : periodCurrentImport);					//watts
				periodUpdatedImportValue = deltaImportValue + (newPeriod ? 0 : periodCurrentImportValue);	//pounds
				dayUpdatedImport = deltaImport + (newDay ? 0 : dayCurrentImport);							//watts
				dayUpdatedImportValue = deltaImportValue + (newDay ? 0 : dayCurrentImportValue);			//pounds
				dayImportStandingCharge = importPrices.standingCharge;										//pounds
				chunkUpdatedImport = deltaImport + (newChunk ? 0 : chunkCurrentImport);						//watts
				chunkUpdatedImportValue = deltaImportValue + (newChunk ? 0 : chunkCurrentImportValue);		//pounds
				importQuartile = importPrices.quartile;
				if (inDispatch && percentDispatchLimit < 100) {
					importQuartile = 0;
				}
			}

			const periodDay = this.getCapabilityValue("period_day.period_day");
			//this.homey.log(`energyAccount.processEvent: periodDay: ${periodDay}`);
			periodUpdatedStandingCharge = (.01 * (dayExportStandingCharge + dayImportStandingCharge)) * periodDay;
			billValue = periodUpdatedStandingCharge + periodUpdatedImportValue - periodUpdatedExportValue;

			const elapsedDays = eventDateTime.diff(currentPeriodStartDate, 'days').days;
			projectedBill = (elapsedDays > 1) ? (billValue / elapsedDays) * periodLength : null;
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
		this.updateCapability("measure_monetary.chunk_import_value", chunkUpdatedImportValue);
		this.updateCapability("measure_monetary.chunk_export_value", chunkUpdatedExportValue);
		this.updateCapability("slot_quartile", importQuartile);
		this.updateCapability("percent.dispatch_limit", percentDispatchLimit);
		this.updateCapability("measure_monetary.unit_price", importPrice / 100);
		this.updateCapability("data_presence.dispatch_pricing", inDispatch);
		this.homey.log(`energyAccount.processEvent: Set dispatchPricing to ${inDispatch}`);
		this.updateCapability("date_time.full_period_start", currentPeriodStartDate.toISO());
		this.updateCapability("date_time.full_next_period", nextPeriodStartDate.toISO());

		updates = await this.updateCapabilities(updates);
		return updates;
	}

}