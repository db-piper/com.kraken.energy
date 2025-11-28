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
		this.defineCapability("meter_power.import_half_hourly", { "title": { "en": "Chunked Energy" }, "uiComponent": null });
		this.defineCapability("measure_monetary.import_half_hourly", { "title": { "en": "Chunked Cost" }, "uiComponent": null });

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
		const periodDay = this.computePeriodDay((new Date).toISOString(), Number(startDay));
		await this.setCapabilityValue("period_day.period_day", periodDay);
		//TODO: Reset next period start to reflect the new start day;
	}

	/**
	 * For a given date compute the number of the day in the period 
	 * @param		{string} 		atTime					Date to compute period-day of
	 * @param   {integer}		periodStartDay	The day in month when the period starts 
	 * @returns {integer}										The 1-based index into the period of the date
	 */
	computePeriodDay(atTime, periodStartDay) {
		const eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime));
		const periodStartDate = this.computePeriodStartDate(atTime, periodStartDay);
		const periodDay = 1 + eventDateTime.diff(periodStartDate, 'days').days;
		return periodDay;
	}

	computePeriodStartDate(atTime, periodStartDay) {
		const eventDateTime = this.accountWrapper.getLocalDateTime(new Date(atTime));
		eventDateTime.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
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

		const billingPeriodStartDay = await this.initialiseBillingPeriodStartDay();
		const firstTime = billingPeriodStartDay === null;
		const currentDispatch = this.getCurrentDispatch(atTime, plannedDispatches)
		const inDispatch = currentDispatch !== undefined;
		const minPrice = await this.accountWrapper.minimumDayPrice(atTime, false);				// Pence
		this.homey.log(`energyAccount.processEvent: currentDispatch ${JSON.stringify(currentDispatch)} inDispatch ${inDispatch} minPrice ${minPrice}`);

		//Have 30 minute old energy and cost capabilities
		//On :00 and :30
		//Incremental_energy is current_reading - 30_minute_old_energy
		//Incremental_cost is Incremental_energy * current_price (tariff or dispatch)
		//Adjusted_Total_Cost is 30_minute_old_cost + incremental_Cost
		//Reset "real cost" capability to be Adjusted_Total_Cost
		//30_minute_old_cost = adjusted total cost
		//30_minute_old_energy = current reading

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
				//const importPrice = inDispatch ? minPrice / 100 : importPrices.unitRate / 100;
				//Change the price, below, to use importPrice const
				deltaImportValue = (deltaImport / 1000) * (importPrices.unitRate / 100);
				periodUpdatedImport = deltaImport + (newPeriod ? 0 : periodCurrentImport);
				periodUpdatedImportValue = deltaImportValue + (newPeriod ? 0 : periodCurrentImportValue);
				dayUpdatedImport = deltaImport + (newDay ? 0 : dayCurrentImport);
				dayUpdatedImportValue = deltaImportValue + (newDay ? 0 : dayCurrentImportValue);
				dayImportStandingCharge = importPrices.standingCharge;
			}

			const periodDay = this.getCapabilityValue("period_day.period_day");
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

		updates = await this.updateCapabilities(updates);
		return updates;
	}

}