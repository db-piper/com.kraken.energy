'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");
const { DateTime } = require("../node_modules/luxon");

module.exports = class energyAccount extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('energyAccount Device:onInit - energyAccount device has been initialized');
		await this.addCapability("period_day.period_day");
		await this.addCapability("period_day.period_duration");
		await this.addCapability("measure_monetary.account_balance");
		await this.addCapability("measure_monetary.projected_bill");
		await this.addCapability("meter_power.import");
		await this.addCapability("meter_power.export");
		await this.addCapability("meter_power.period_import");
		await this.addCapability("meter_power.period_export");
		await this.addCapability("measure_monetary.period_import_value");
		await this.addCapability("measure_monetary.period_export_value");
		await this.addCapability("measure_monetary.period_standing_charge");
		await this.addCapability("measure_monetary.period_bill");
		await this.addCapability("meter_power.day_import");
		await this.addCapability("meter_power.day_export");
		await this.addCapability("measure_monetary.day_import_value");
		await this.addCapability("measure_monetary.day_export_value");
		await this.addCapability("month_day.period_start");
		await this.addCapability("date_time.period_start");
		await this.addCapability("date_time.next_period_start");

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
		await this.updateCapabilityOptions("period_day.period_duration",
			{
				"title":
					{ "en": "Period Duration" },
				"icon": "../assets/duration.svg"
			},
		)
		await this.updateCapabilityOptions("measure_monetary.projected_bill",
			{
				"title":
					{ "en": "Projected Bill" },
				"units":
					{ "en": "£" }
			}
		);
		await this.updateCapabilityOptions("meter_power.import",
			{
				"title":
					{ "en": "Cumulative Import" },
				"decimals": 3
			}
		);
		await this.updateCapabilityOptions("meter_power.export",
			{
				"title":
					{ "en": "Cumulative Export" },
				"decimals": 3
			}
		);
		await this.updateCapabilityOptions("meter_power.period_import",
			{
				"title":
					{ "en": "Period Import" },
				"decimals": 3
			}
		);
		await this.updateCapabilityOptions("meter_power.period_export",
			{
				"title":
					{ "en": "Period Export" },
				"decimals": 3
			}
		);
		await this.updateCapabilityOptions("measure_monetary.period_import_value",
			{
				"title":
					{ "en": "Import Cost" },
				"decimals": 2,
				"units":
					{"en": "£"}
			}
		);
		await this.updateCapabilityOptions("measure_monetary.period_export_value",
			{
				"title":
					{ "en": "Export Value" },
				"decimals": 2,
				"units":
					{"en": "£"}
			}
		);
		await this.updateCapabilityOptions("measure_monetary.period_standing_charge",
			{
				"title":
					{ "en": "Standing Charge" },
				"decimals": 2,
				"units":
					{"en": "£"}
			}
		);
		await this.updateCapabilityOptions("measure_monetary.period_bill",
			{
				"title":
					{ "en": "Bill Total" },
				"decimals": 2,
				"units":
					{"en": "£"}
			}
		);
		await this.updateCapabilityOptions("meter_power.day_import",
			{
				"title":
					{ "en": "Day Import" },
				"decimals": 3
			}
		);
		await this.updateCapabilityOptions("meter_power.day_export",
			{
				"title":
					{ "en": "Day Export" },
				"decimals": 3
			}
		);
		await this.updateCapabilityOptions("measure_monetary.day_import_value",
			{
				"title":
					{ "en": "Day Import Cost" },
				"decimals": 2,
				"units":
					{ "en": "£"}
			}
		);
		await this.updateCapabilityOptions("measure_monetary.day_export_value",
			{
				"title":
					{ "en": "Day Export Value" },
				"decimals": 2,
				"units":
					{"en": "£"}
			}
		);
		await this.updateCapabilityOptions("measure_monetary.account_balance",
			{
				"title":
					{ "en": "Account Balance" },
				"units":
					{ "en": "£" }
			}
		);
		await this.updateCapabilityOptions("month_day.period_start",
			{
				"title":
					{ "en": "Period Start Day" }
			}
		);
		await this.updateCapabilityOptions("date_time.period_start",
			{
				"title":
					{ "en": "This Period Start" }
			},
		);
		await this.updateCapabilityOptions("date_time.next_period_start",
			{
				"title":
					{ "en": "Next Period Start" }
			},
		)
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
	 * @param {object} event the onSettings event data
	 * @param {object} event.oldSettings The old settings object
	 * @param {object} event.newSettings The new settings object
	 * @param {string[]} event.changedKeys An array of keys changed since the previous version
	 * @returns {Promise<string|void>} return a custom message that will be displayed
	 */
	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.log('energyAccount Device:onSettings - settings where changed');
	}

	async updatePeriodDay(startDay) {
		const periodDay = this.computePeriodDay((new Date).toISOString(), Number(startDay));
		this.homey.log(`energyAccount.updatePeriodDay: PeriodStart: ${startDay} PeriodDay: ${periodDay}`);
		this.setCapabilityValue("period_day.period_day", periodDay);
		//TODO: Reset next period start to reflect the new start day;
	}

	/**
	 * For a given date compute the number of the day in the period 
	 * @param		{string} 		atTime					Date to compute period-day of
	 * @param   {integer}		periodStartDay	The day in month when the period starts 
	 * @returns {integer}										The 1-based index into the period of the date
	 */
	computePeriodDay(atTime, periodStartDay) {
		const eventDateTime = this.getLocalDateTime(new Date(atTime));
		const periodStartDate = this.computePeriodStartDate(atTime, periodStartDay);
		const periodDay = 1 + eventDateTime.diff(periodStartDate, 'days').days;
		return periodDay;
	}

	computePeriodStartDate(atTime, periodStartDay) {
		const eventDateTime = this.getLocalDateTime(new Date(atTime));
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
		const date = (dateString === null) ? valueOnNull : this.getLocalDateTime(new Date(dateString));
		return date.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
	}

	async processEvent(atTime, newDay, liveMeterReading = undefined) {

		let updates = await super.processEvent(atTime, newDay, liveMeterReading);
		this.homey.log(`energyAccount.processEvent: Returned from super method`);

		let billingPeriodStartDay = await this.getCapabilityValue("month_day.period_start");
		const firstTime = billingPeriodStartDay === null;
		if (firstTime) {
			billingPeriodStartDay = (await this.driver.managerEvent.accountWrapper.getBillingPeriodStartDay()).toString().padStart(2,'0');
		}
		await this.triggerCapabilityListener('month_day.period_start', billingPeriodStartDay, {});

		const periodLength = this.computePeriodLength(atTime, Number(billingPeriodStartDay));
		const currentBalance = this.driver.managerEvent.accountWrapper.getCurrentBalance();
		const exportPrices = await this.getTariffDirectionPrices(atTime, true);
		const exportTariffPresent = exportPrices !== undefined;
		const importPrices = await this.getTariffDirectionPrices(atTime, false);
		const importTariffPresent = importPrices !== undefined;

		let currentPeriodStartDate = this.getPeriodStartDate("date_time.period_start", this.computePeriodStartDate(atTime, billingPeriodStartDay));
		let nextPeriodStartDate = this.getPeriodStartDate("date_time.next_period_start", currentPeriodStartDate.plus({ months: 1 }));
		let newPeriod = false;
		let eventDateTime = this.getLocalDateTime(new Date(atTime));

		if (eventDateTime > nextPeriodStartDate) {
			this.homey.log(`energyAccount.processEvent: New period detected ${nextPeriodStartDate}`);
			currentPeriodStartDate = nextPeriodStartDate;
			nextPeriodStartDate = nextPeriodStartDate.plus({ months: 1 });
			newPeriod = true;
		}

		this.homey.log(`energyAccount.processEvent: newPeriod: ${newPeriod}`);

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
				dayUpdatedExportValue  = deltaExportValue + (newDay ? 0 : dayCurrentExportValue);
				dayExportStandingCharge = exportPrices.standingCharge;
			}

			if (importTariffPresent) {
				deltaImport = liveMeterReading.consumption - currentImport;
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
			projectedBill = (billValue / elapsedDays) * periodLength; 
			this.homey.log(`energyAccount.processEvnet: billValue ${billValue} periodLength ${periodLength}`);
			this.homey.log(`energyAccount.processEvent: elapsedDays ${elapsedDays} projectedBill ${projectedBill}`);
		}

		updates = (await this.updateCapabilityValue("period_day.period_duration", periodLength)) || updates;
		updates = (await this.setCapabilityValue("measure_monetary.account_balance", currentBalance)) || updates;

		updates = (await this.updateCapabilityValue("date_time.period_start", currentPeriodStartDate.toISO())) || updates;
		updates = (await this.updateCapabilityValue("date_time.next_period_start", nextPeriodStartDate.toISO())) || updates;
		updates = (await this.updateCapabilityValue("meter_power.export", liveMeterReading.export / 1000)) || updates;
		updates = (await this.updateCapabilityValue("meter_power.import", liveMeterReading.consumption / 1000)) || updates;
		updates = (await this.updateCapabilityValue("meter_power.period_export", periodUpdatedExport / 1000)) || updates;
		updates = (await this.updateCapabilityValue("meter_power.period_import", periodUpdatedImport / 1000)) || updates;
		updates = (await this.updateCapabilityValue("meter_power.day_export", dayUpdatedExport / 1000)) || updates;
		updates = (await this.updateCapabilityValue("meter_power.day_import", dayUpdatedImport / 1000)) || updates;
		updates = (await this.updateCapabilityValue("measure_monetary.period_export_value", periodUpdatedExportValue)) || updates;
		updates = (await this.updateCapabilityValue("measure_monetary.period_import_value", periodUpdatedImportValue)) || updates;
		updates = (await this.updateCapabilityValue("measure_monetary.day_export_value", dayUpdatedExportValue)) || updates;
		updates = (await this.updateCapabilityValue("measure_monetary.day_import_value", dayUpdatedImportValue)) || updates;
		updates = (await this.updateCapabilityValue("measure_monetary.period_standing_charge", periodUpdatedStandingCharge)) || updates;
		updates = (await this.updateCapabilityValue("measure_monetary.period_bill", billValue)) || updates;
		updates = (await this.updateCapabilityValue("measure_monetary.projected_bill", projectedBill)) || updates;

		return updates;
	}

}