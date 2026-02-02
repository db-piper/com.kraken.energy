'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class productTariff extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('productTariff Device:onInit - productTariff device has been initialized');
		await super.onInit();

		const isDispatchable = (await this.accountWrapper.getDeviceIds()).length > 0;
		const isHalfHourly = await this.accountWrapper.isHalfHourly(this.isExport());
		this.defineStoreValue('isHalfHourly', isHalfHourly);
		const slotLabelWord = isHalfHourly ? "Slot" : "Day";

		this.defineCapability("product_code");
		this.defineCapability("tariff_code");
		this.defineCapability("measure_monetary.unit_price_taxed", { "title": { "en": '£/kWh' }, "decimals": 4, "units": { "en": "£", } });
		this.defineCapability("measure_monetary.standing_charge_taxed", { "title": { "en": 'Daily Charge', }, "decimals": 4, "units": { "en": "£", } });
		this.defineCapability("meter_power", { "title": { "en": 'Cumulative kWh' }, "decimals": 3 });
		this.defineCapability("meter_power.consumption", { "title": { "en": `${slotLabelWord} Energy kWh` }, "decimals": 3 });
		this.defineCapability("measure_monetary.energy_value_taxed", { "title": { "en": `${slotLabelWord} Energy £ ` }, "decimals": 4, "units": { "en": "£", } });
		this.defineCapability("measure_power.average", { "title": { "en": `${slotLabelWord} Ave. Power` } });
		this.defineCapability("slot_quartile", { "title": { "en": "Price Quartile" } }, [], isHalfHourly);
		this.defineCapability("percent.tax_rate", { "title": { "en": "Tax Rate" } });
		this.defineCapability("date_time.slot_start", { "title": { "en": `${slotLabelWord} Start` } });
		this.defineCapability("date_time.slot_end", { "title": { "en": `${slotLabelWord} End`, } });
		this.defineCapability("measure_monetary.next_unit_price_taxed", { "title": { "en": 'Next £/kWh', }, "units": { "en": "£", "fr": "€" }, "decimals": 4 }, [], isHalfHourly);
		this.defineCapability("slot_quartile.next_slot_quartile", { "title": { "en": "Next Price Quartile" } }, [], isHalfHourly);
		this.defineCapability("data_presence.next_day_prices", { "title": { "en": "Tomorrow's Prices" } }, [], isHalfHourly);
		this.defineCapability("date_time.next_slot_end", { "title": { "en": 'Next Slot End' } }, [], isHalfHourly);
		this.defineCapability("data_presence.dispatch_pricing", { "title": { "en": "Dispatch Pricing" } }, [], isDispatchable);
		this.defineCapability("date_time.full_slot_start", { "title": { "en": "SlotStartH" }, "uiComponent": null }, []);
		this.defineCapability("date_time.full_slot_end", { "title": { "en": "SlotEndH" }, "uiComponent": null }, []);

		await this.applyCapabilities();
		await this.applyStoreValues();

	}

	/**
	 * onAdded is called when the user adds the device, called just after pairing.
	 */
	async onAdded() {
		this.log('productTariff Device:onAdded - has been added');
	}

	/**
	 * onRenamed is called when the user updates the device's name.
	 * This method can be used this to synchronise the name to the device.
	 * @param {string} name The new name
	 */
	async onRenamed(name) {
		this.log('productTariff Device:onRenamed - was renamed');
	}

	/**
	 * onDeleted is called when the user deleted the device.
	 */
	async onDeleted() {
		this.log('productTariff Device:onDeleted - has been deleted');
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
		this.log('productTariff Device:onSettings - settings were changed');
	}

	/**
	 * Indicate if the current product tariff is an export product tariff
	 * @returns {boolean}           True if the product tariff is export, false otherwise
	 */
	isExport() {
		const isExport = this.getStoreValue("isExport");
		return isExport;
	}

	async isHalfHourlyTariff(direction) {
		let halfHourly = undefined;
		if (this.getStoreKeys().includes("isHalfHourly")) {
			this.log(`productTariff.isHalfHourlyTariff: Already in store`)
			halfHourly = this.getStoreValue("isHalfHourly");
		} else {
			const tariff = this.accountWrapper.getTariffDirection(direction);
			if (tariff !== undefined) {
				halfHourly = ('unitRates' in tariff);
				this.log(`productTariff.isHalfHourlyTariff: Not in store, if tariff: ${halfHourly}`);
				await this.setStoreValue("isHalfHourly", halfHourly);
			}
		}
		return halfHourly;
	}

	/**
	 * Indicate if the current kWh slot price is less than the next kWh slot price
	 * Used as the run listener for the slot_relative_price condition card
	 * @returns {boolean}			True iff currentPrice < nextPrice
	 */
	getCurrentlyCheaper() {
		this.homey.log(`productTariff.getCurrentlyCheaper: Starting`);
		const currentPrice = this.getCapabilityValue("measure_monetary.unit_price");
		const nextPrice = this.getCapabilityValue("measure_monetary.next_unit_price");
		return currentPrice < nextPrice;
	}

	/**
	 * Process an event for the tariff.
	 * @param     {string}        atTime            String representation of the event time
	 * @param     {boolean}       newDay            Indicates that any newDay processing should occur
	 * @param     {object - JSON} liveMeterReading  SmartMeterTelemetry {demand, export, consumption, readAt} 
	 * @returns   {boolean}                         Indicates if any updates have been made to the device capabilities
	 */
	async processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = {}) {

		let updates = await super.processEvent(atTime, newDay, liveMeterReading, plannedDispatches);

		const direction = this.isExport();
		const eventTime = new Date(atTime);
		const tariff = await this.accountWrapper.getTariffDirection(direction);
		const tariffPrices = await this.accountWrapper.getTariffDirectionPrices(atTime, direction);
		const nextTariffPrices = await this.accountWrapper.getNextTariffSlotPrices(tariffPrices.nextSlotStart, tariffPrices.isHalfHourly, direction);
		const nextTariffAbsent = nextTariffPrices.unitRate === null;
		const recordedSlotEnd = this.getCapabilityValue("date_time.full_slot_end");
		const recordedSlotStart = this.getCapabilityValue("date_time.full_slot_start");
		const firstTime = recordedSlotEnd === null;
		const propertyName = direction ? "export" : "consumption";
		const newEnergyReading = +liveMeterReading[propertyName];														//Wh as integer
		const slotChange = firstTime ? true : (eventTime >= new Date(recordedSlotEnd));									//Boolean
		const duration = firstTime ? 0 : ((eventTime - new Date(recordedSlotStart)) / (60 * 60 * 1000));				//Decimal hours
		const lastEnergyReading = firstTime ? newEnergyReading : 1000 * await this.getCapabilityValue("meter_power");	//Wh
		const slotEnergy = firstTime ? 0 : (1000 * this.getCapabilityValue("meter_power.consumption"));					//Wh
		const slotValueTaxed = firstTime ? 0 : this.getCapabilityValue("measure_monetary.energy_value_taxed");			//£
		const productCode = tariff.productCode;
		const tariffCode = tariff.tariffCode;
		const taxRate = 100 * (tariffPrices.unitRate - tariffPrices.preVatUnitRate) / tariffPrices.preVatUnitRate;		//%
		const minPrice = await this.accountWrapper.minimumPriceOnDate(atTime, direction);
		const isDispatchable = (await this.accountWrapper.getDeviceIds()).length > 0;
		const unitPriceTaxed = .01 * ((isDispatchable && (!direction)) ? minPrice : tariffPrices.unitRate);		//£	
		this.homey.log(`productTariff.processEvent: unitPriceTaxed: ${unitPriceTaxed} isDispatchable: ${isDispatchable} import: ${!direction}`);
		const standingChargeTaxed = .01 * tariff.standingCharge;												//£
		const deltaEnergy = newEnergyReading - lastEnergyReading;												//Wh
		const deltaEnergyValueTaxed = unitPriceTaxed * (deltaEnergy / 1000);									//£
		const updatedSlotEnergy = (deltaEnergy + (slotChange ? 0 : slotEnergy)) / 1000;							//kWh 
		const updatedSlotValueTaxed = deltaEnergyValueTaxed + (slotChange ? 0 : slotValueTaxed);				//£
		const slotPower = (duration > 0) ? 1000 * updatedSlotEnergy / duration : 0;								//W
		const slotQuartile = tariffPrices.quartile;
		const slotStart = tariffPrices.thisSlotStart;															//ISO
		const shortStart = this.accountWrapper.getLocalDateTime(new Date(slotStart)).toFormat("dd/LL T");
		const slotEnd = tariffPrices.nextSlotStart;
		const shortEnd = this.accountWrapper.getLocalDateTime(new Date(slotEnd)).toFormat("dd/LL T");			//ISO
		const nextUnitPriceTaxed = nextTariffAbsent ? null : .01 * nextTariffPrices.unitRate;					//£
		const nextQuartile = nextTariffAbsent ? null : nextTariffPrices.quartile;
		const nextDayPresent = await this.accountWrapper.getTomorrowsPricesPresent(atTime, direction);			//Boolean
		const nextSlotEnd = nextTariffAbsent ? null : nextTariffPrices.nextSlotStart;							//ISO
		let shortNextEnd = null;
		if (!nextTariffAbsent) {
			shortNextEnd = this.accountWrapper.getLocalDateTime(new Date(nextSlotEnd)).toFormat("dd/LL T");
		}
		const currentDispatch = this.getCurrentDispatch(atTime, plannedDispatches)
		const inDispatch = currentDispatch !== undefined;

		this.updateCapability("product_code", productCode);
		this.updateCapability("tariff_code", tariffCode);
		this.updateCapability("measure_monetary.unit_price_taxed", unitPriceTaxed);
		this.updateCapability("measure_monetary.standing_charge_taxed", standingChargeTaxed);
		this.updateCapability("meter_power", newEnergyReading / 1000);
		this.updateCapability("meter_power.consumption", updatedSlotEnergy);
		this.updateCapability("measure_monetary.energy_value_taxed", updatedSlotValueTaxed);
		this.updateCapability("measure_power.average", slotPower);
		this.updateCapability("slot_quartile", slotQuartile);
		this.updateCapability("percent.tax_rate", taxRate);
		this.updateCapability("date_time.slot_start", shortStart);
		this.updateCapability("date_time.full_slot_start", slotStart);
		this.updateCapability("date_time.slot_end", shortEnd);
		this.updateCapability("date_time.full_slot_end", slotEnd);
		this.updateCapability("data_presence.next_day_prices", nextDayPresent);
		this.updateCapability("measure_monetary.next_unit_price_taxed", nextUnitPriceTaxed);
		this.updateCapability("slot_quartile.next_slot_quartile", nextQuartile);
		this.updateCapability("date_time.next_slot_end", shortNextEnd);
		this.updateCapability("data_presence.dispatch_pricing", inDispatch);

		updates = await this.updateCapabilities(updates);
		return updates;

	}

}