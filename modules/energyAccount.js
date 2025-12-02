'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class energyAccount extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('energyAccount Device:onInit - energyAccount device has been initialized');
		await super.onInit();
		this.defineCapability("month_day.period_start", { "title": { "en": "Period Start Day" } });
		this.defineCapability("period_day.period_day");
		this.defineCapability("period_day.period_duration", { "title": { "en": "Period Duration" } });
		this.defineCapability("measure_monetary.account_balance", { "title": { "en": "Account Balance" }, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.projected_bill", { "title": { "en": "Projected Bill" }, "units": { "en": "£" } });
		this.defineCapability("meter_power.import", { "title": { "en": "Cumulative Import" }, "decimals": 3 });
		this.defineCapability("meter_power.export", { "title": { "en": "Cumulative Export" }, "decimals": 3 });
		this.defineCapability("meter_power.period_import", { "title": { "en": "Period Import" }, "decimals": 3 });
		this.defineCapability("meter_power.period_export", { "title": { "en": "Period Export" }, "decimals": 3 });
		this.defineCapability("measure_monetary.period_import_value", { "title": { "en": "Import Cost" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.period_export_value", { "title": { "en": "Export Value" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.period_standing_charge", { "title": { "en": "Standing Charge" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.period_bill", { "title": { "en": "Bill Total" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("meter_power.day_import", { "title": { "en": "Day Import" }, "decimals": 3 });
		this.defineCapability("meter_power.day_export", { "title": { "en": "Day Export" }, "decimals": 3 });
		this.defineCapability("measure_monetary.day_import_value", { "title": { "en": "Day Import Cost" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("measure_monetary.day_export_value", { "title": { "en": "Day Export Value" }, "decimals": 2, "units": { "en": "£" } });
		this.defineCapability("date_time.period_start", { "title": { "en": "This Period Start" } });
		this.defineCapability("date_time.next_period_start", { "title": { "en": "Next Start Day" } });
		this.defineCapability("date_time.full_period_start", { "title": { "en": "Full Start Date" }, "uiComponent": null });
		this.defineCapability("date_time.full_next_period", { "title": { "en": "Full Next Start" }, "uiComponent": null });

		this.defineCapability("meter_power.chunk_import", { "title": {"en": "Chunk Import"}, "decimals": 3});
		this.defineCapability("meter_power.chunk_import_consumption", { "title": {"en": "Chunk Consumption"}, "decimals": 3});
		this.defineCapability("measure_monetary.chunk_import_value", {"title": {"en": "Chunk Value"}, "decimals": 2, "units": {"en": "£"}});
		this.defineCapability("measure_monetary.chunk_accumulated_value", {"title": {"en": "Chunk Accum Value"}, "decimals": 2, "units": {"en": "£"}});
		//this.defineCapability("measure_monetary.chunk_period_value", {"title": {"en": "Chunk Period Value"}, "units": {"en": "£"}});
		//this.defineCapability("measure_monetary.chunk_day_value", {"title": {"en": "Chunk Day Value"}, "units": {"en": "£"}});

		await this.applyCapabilities();
		await this.applyStoreValues();

		this.homey.log(`energyAccount.onInit: Registering capability listener.`);
		this.registerCapabilityListener('month_day.period_start', async (value, opts) => {
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

	async updatePeriodDay(startDay) {
		const atTime = (new Date()).toISOString();
		const periodDay = this.computePeriodDay(atTime, Number(startDay));
		const periodStartDate = this.computePeriodStartDate(atTime, startDay);
		const nextStartDate = this.computePeriodStartDate(periodStartDate.plus({months: 1}).toISO(), startDay);
		await this.setCapabilityValue("period_day.period_day", periodDay);
		await this.setCapabilityValue("date_time.period_start", periodStartDate.toFormat("yyyy-LL-dd"));
		await this.setCapabilityValue("date_time.full_period_start", periodStartDate.toISO());
		await this.setCapabilityValue("date_time.next_period_start", nextStartDate.toFormat("yyyy-LL-dd"));
		await this.setCapabilityValue("date_time.full_next_period", nextStartDate.toISO());

		//TODO: Reset next period start to reflect the new start day;
	}

	/**
	 * For a given date compute the number of the day in the period 
	 * @param		{string} 		atTime					Date to compute period-day of
	 * @param   {integer}		periodStartDay	The day in month when the period starts 
	 * @returns {integer}										The 1-based index into the period of the date
	 */
	computePeriodDay(atTime, periodStartDay) {
		const eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime)).set({ hour: 0, minute: 0, second: 0, millisecond: 0});
		const periodStartDate = this.computePeriodStartDate(atTime, periodStartDay);
		const periodDay = 1 + eventDateTime.diff(periodStartDate, 'days').days;
		this.homey.log(`energyAccount.computePeriodDay: periodDay ${periodDay}`);
		return periodDay;
	}

	computePeriodStartDate(atTime, periodStartDay) {
		const eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime)).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
		const currentDay = eventDateTime.day;
		const periodStartDate = (currentDay < periodStartDay) ?
			eventDateTime.minus({ months: 1 }).set({ day: Number(periodStartDay) }) :
			eventDateTime.set({ day: Number(periodStartDay) });
		return periodStartDate;
	}

	computePeriodLength(atTime, periodStartDay) {
		const periodStartDate = this.computePeriodStartDate(atTime, periodStartDay);
		const lastDay = periodStartDate.endOf('month').day;
		return lastDay;
	}

	getPeriodStartDate(capabilityName, valueOnNull) {
		const dateString = this.getCapabilityValue(capabilityName);
		const date = (dateString === null) ? valueOnNull : this.accountWrapper.getLocalDateTime(new Date(dateString));
		return date.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
		//TODO: define and apply constant midnight in device.js
	}

	async initialiseBillingPeriodStartDay() {
		let billingPeriodStartDay = await this.getCapabilityValue("month_day.period_start");
		const firstTime = billingPeriodStartDay === null;
		if (firstTime) {
			billingPeriodStartDay = (this.accountWrapper.getBillingPeriodStartDay()).toString().padStart(2, '0');
		}
		try {
			await this.triggerCapabilityListener('month_day.period_start', billingPeriodStartDay, {});
			this.homey.log(`energyAccount.processEvent: triggerCapabilityListener success`);
		} catch (error) {
			this.homey.log(`energyAccount.processEvent: triggerCapabilityListener error`);
			if (error.message.includes('month_day.period_start')) {
				this.homey.log(`energyAccount.processEvent: registering capability listener`);
				this.registerCapabilityListener('month_day.period_start', async (value, opts) => {
					await this.updatePeriodDay(value);
				});
				await this.updatePeriodDay(billingPeriodStartDay);
			}
		}
		return billingPeriodStartDay;
	}

	async processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = {}) {

		let updates = await super.processEvent(atTime, newDay, liveMeterReading, plannedDispatches);

		const firstTime = (null === this.getCapabilityValue("meter_power.import"));
		const billingPeriodStartDay = await this.initialiseBillingPeriodStartDay();
		this.homey.log(`energyAccount.processEvent: billingPeriodStart: ${billingPeriodStartDay} first: ${firstTime}`);
		const currentDispatch = this.getCurrentDispatch(atTime, plannedDispatches)
		const inDispatch = currentDispatch !== undefined;
		const minPrice = await this.accountWrapper.minimumDayPrice(atTime, false);				// Pence
		this.homey.log(`energyAccount.processEvent: currentDispatch ${JSON.stringify(currentDispatch)} inDispatch ${inDispatch} minPrice ${minPrice}`);

		const periodLength = this.computePeriodLength(atTime, Number(billingPeriodStartDay));
		const currentBalance = this.accountWrapper.getCurrentBalance();
		const exportPrices = await this.accountWrapper.getTariffDirectionPrices(atTime, true);
		const exportTariffPresent = exportPrices !== undefined;
		const importPrices = await this.accountWrapper.getTariffDirectionPrices(atTime, false);
		const importTariffPresent = importPrices !== undefined;

		let currentPeriodStartDate = this.getPeriodStartDate("date_time.full_period_start", this.computePeriodStartDate(atTime, billingPeriodStartDay));
		let nextPeriodStartDate = this.getPeriodStartDate("date_time.full_next_period", currentPeriodStartDate.plus({ months: 1 }));
		let newPeriod = false;
		let eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime));

		if (eventDateTime > nextPeriodStartDate) {
			this.homey.log(`energyAccount.processEvent: New period detected ${nextPeriodStartDate}`);
			currentPeriodStartDate = nextPeriodStartDate;
			nextPeriodStartDate = nextPeriodStartDate.plus({ months: 1 });
			newPeriod = true;
		}

		const currentExport = 1000 * await this.getCapabilityValue("meter_power.export");
		const periodCurrentExport = 1000 * await this.getCapabilityValue("meter_power.period_export");
		const periodCurrentExportValue = await this.getCapabilityValue("measure_monetary.period_export_value");
		const dayCurrentExport = 1000 * await this.getCapabilityValue("meter_power.day_export");
		const dayCurrentExportValue = await this.getCapabilityValue("measure_monetary.day_export_value");
		const currentImport = 1000 * await this.getCapabilityValue("meter_power.import");
		const periodCurrentImport = 1000 * await this.getCapabilityValue("meter_power.period_import");
		const periodCurrentImportValue = await this.getCapabilityValue("measure_monetary.period_import_value");
		const dayCurrentImport = 1000 * await this.getCapabilityValue("meter_power.day_import");
		const dayCurrentImportValue = await this.getCapabilityValue("measure_monetary.day_import_value");
		const chunkImport = 1000 * await this.getCapabilityValue("meter_power.chunk_import");
		let chunkAccumulatedValue = await this.getCapabilityValue("measure_monetary.chunk_accumulated_value");

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
		let periodUpdatedStandingCharge = 0;
		let billValue = 0;
		let projectedBill = 0;
		let chunkConsumption = 0;
		let chunkValue = 0;

		if (!firstTime) {
			if (exportTariffPresent) {
				deltaExport = liveMeterReading.export - currentExport;
				deltaExportValue = (deltaExport / 1000) * (exportPrices.unitRate / 100);
				periodUpdatedExport = deltaExport + (newPeriod ? 0 : periodCurrentExport);
				periodUpdatedExportValue = deltaExportValue + (newPeriod ? 0 : periodCurrentExportValue);
				dayUpdatedExport = deltaExport + (newDay ? 0 : dayCurrentExport);
				dayUpdatedExportValue = deltaExportValue + (newDay ? 0 : dayCurrentExportValue);
				dayExportStandingCharge = exportPrices.standingCharge;
			}

			if (importTariffPresent) {
				deltaImport = liveMeterReading.consumption - currentImport;
				const importPrice = inDispatch ? minPrice : importPrices.unitRate;
				deltaImportValue = (deltaImport / 1000) * (importPrice / 100);
				this.homey.log(`energyAccount.processEvent: deltaImport ${deltaImport} importPrice ${importPrice} deltaImportValue ${deltaImportValue}`);
				periodUpdatedImport = deltaImport + (newPeriod ? 0 : periodCurrentImport);
				periodUpdatedImportValue = deltaImportValue + (newPeriod ? 0 : periodCurrentImportValue);
				this.homey.log(`energyAccount.processEvent: period Import: ${periodUpdatedImport} value ${periodUpdatedImportValue}`);
				dayUpdatedImport = deltaImport + (newDay ? 0 : dayCurrentImport);
				dayUpdatedImportValue = deltaImportValue + (newDay ? 0 : dayCurrentImportValue);
				this.homey.log(`energyAccount.processEvent: day Import: ${dayUpdatedImport} value ${dayUpdatedImportValue}`);
				dayImportStandingCharge = importPrices.standingCharge;
				chunkConsumption = liveMeterReading.consumption - chunkImport;
				//chunkValue is whole chunk consumption so far at the import price (potentially less than tariff price) 
				chunkValue = (chunkConsumption / 1000) * (importPrice / 100);
				//chunkAccumulatedValue is incremental consumption, each increment priced at the tariff OR dispatch price
				chunkAccumulatedValue = chunkAccumulatedValue + deltaImportValue;
				//iff dispatch is inserted in the current half hour, cAV will be part priced at the tariff rate, part at dispatch rate
				//cV is always priced at the prevailing rate (allowing for early start/deferred end)
				this.homey.log(`energyAccount.processEvent: chunk Cons: ${chunkConsumption} value ${chunkValue} accum ${chunkAccumulatedValue}`);
				if ([0, 30].includes(eventDateTime.minute)) {
					//const minPriceValue = (chunkConsumption / 1000) * (minPrice / 100);
					const valueReduction = chunkValue - chunkAccumulatedValue;
					this.homey.log(`energyAccount.processEvent: value ${chunkValue} accum ${chunkAccumulatedValue} reduction ${valueReduction}`);
					periodUpdatedImportValue = periodUpdatedImportValue + valueReduction;
					dayUpdatedImportValue = dayUpdatedImportValue + valueReduction;
					chunkAccumulatedValue = 0;
					this.homey.log(`energyAccount.processEvent: chunk: CONS ${chunkConsumption} VR ${valueReduction} PIV ${periodUpdatedImportValue} DIV ${dayUpdatedImportValue}`);
				}
			}

			const periodDay = this.getCapabilityValue("period_day.period_day");
			this.homey.log(`energyAccount.processEvent: periodDay: ${periodDay}`);
			periodUpdatedStandingCharge = (.01 * (dayExportStandingCharge + dayImportStandingCharge)) * periodDay;
			billValue = periodUpdatedStandingCharge + periodUpdatedImportValue - periodUpdatedExportValue;

			const elapsedDays = eventDateTime.diff(currentPeriodStartDate, 'days').days;
			projectedBill = (elapsedDays > 1) ? (billValue / elapsedDays) * periodLength : null;
		}

		this.updateCapability("period_day.period_duration", periodLength);
		this.updateCapability("measure_monetary.account_balance", currentBalance);
		this.updateCapability("date_time.period_start", currentPeriodStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability("date_time.full_period_start", currentPeriodStartDate.toISO());
		this.updateCapability("date_time.next_period_start", nextPeriodStartDate.toFormat("yyyy-LL-dd"));
		this.updateCapability("date_time.full_next_period", nextPeriodStartDate.toISO());

		this.updateCapability("meter_power.export", liveMeterReading.export / 1000);
		this.updateCapability("meter_power.import", liveMeterReading.consumption / 1000);
		this.updateCapability("meter_power.period_export", periodUpdatedExport / 1000);
		this.updateCapability("meter_power.period_import", periodUpdatedImport / 1000);
		this.updateCapability("meter_power.day_export", dayUpdatedExport / 1000);
		this.updateCapability("meter_power.day_import", dayUpdatedImport / 1000);
		this.updateCapability("measure_monetary.period_export_value", periodUpdatedExportValue);
		this.updateCapability("measure_monetary.period_import_value", periodUpdatedImportValue);
		this.updateCapability("measure_monetary.day_export_value", dayUpdatedExportValue);
		this.updateCapability("measure_monetary.day_import_value", dayUpdatedImportValue);
		this.updateCapability("measure_monetary.period_standing_charge", periodUpdatedStandingCharge);
		this.updateCapability("measure_monetary.period_bill", billValue);
		this.updateCapability("measure_monetary.projected_bill", projectedBill);
		this.updateCapability("measure_monetary.chunk_accumulated_value", chunkAccumulatedValue);

		if ([0,30].includes(eventDateTime.minute) || firstTime) {
			this.updateCapability("meter_power.chunk_import", liveMeterReading.consumption / 1000);
			this.updateCapability("meter_power.chunk_import_consumption", chunkConsumption / 1000);
			this.updateCapability("measure_monetary.chunk_import_value", chunkValue);
		}

		updates = await this.updateCapabilities(updates);
		return updates;
	}

}