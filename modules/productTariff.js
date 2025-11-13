'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class productTariff extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		//TODO: Reverse ordering of Tomorrow's Prices and Next Slot Quartile capabilities
		this.log('productTariff Device:onInit - productTariff device has been initialized');
		await super.onInit();

		const isHalfHourly = await this.isHalfHourly(this.isExport());
		this.defineStoreValue('isHalfHourly', isHalfHourly);
		const slotLabelWord  = isHalfHourly ? "Slot" : "Day";
		const deviceCount = await this.accountWrapper.getDeviceCount();

		this.defineCapability("product_code");
		this.defineCapability("tariff_code");
		this.defineCapability("measure_monetary.unit_price",{"title":{"en": '£/kWh', "fr": '€/kWh',}, "decimals": 4, "units": {"en": "£", "fr": "€",}});
		this.defineCapability("measure_monetary.unit_price_taxed",{"title": {"en": '£/kWh (Taxed)'}, "decimals": 4, "units": {"en": "£",}});
		this.defineCapability("measure_monetary.standing_charge",{"title":{"en": 'Std Charge',},"decimals": 4,"units":{"en": "£",}});
		this.defineCapability("measure_monetary.standing_charge_taxed",{"title":{"en": 'Std Charge (Taxed)',},"decimals": 4,"units":{"en": "£",}});
		this.defineCapability("meter_power",{"title": {"en": 'Cumulative kWh'}, "decimals": 3});
		this.defineCapability("meter_power.consumption",{"title":{"en": `${slotLabelWord} Energy kWh`}, "decimals": 3});
		this.defineCapability("measure_monetary.energy_value",{"title": {"en": `${slotLabelWord} Energy £`,},"decimals": 4,"units": {"en": "£",}});
		this.defineCapability("measure_monetary.energy_value_taxed",{"title": {"en": `${slotLabelWord} £ (Taxed)`}, "decimals": 4, "units": {"en": "£",}});
		this.defineCapability("measure_power.average",{"title":{"en": `${slotLabelWord} Ave. Power`}});
		if (isHalfHourly) {
			this.defineCapability("slot_quartile",{"title": {"en": "Price Quartile"}});
		}
		this.defineCapability("date_time.slot_start", {"title":{"en": `${slotLabelWord} Start`}});
		this.defineCapability("date_time.slot_end",{"title":{"en": `${slotLabelWord} End`,}});
		if (isHalfHourly) {
			this.defineCapability("measure_monetary.next_unit_price",{"title":{"en": 'Next £/kWh'},"units": {"en": "£", "fr": "€"},"decimals": 4});
			this.defineCapability("measure_monetary.next_unit_price_taxed",{"title": {"en": 'Next £/kWh (Taxed)',}, "units": {"en": "£", "fr": "€"}, "decimals": 4});
			this.defineCapability("measure_monetary.next_standing_charge", {"title": {"en": 'Next Std Charge'}, "units": {"en": "£","fr": "€"}, "decimals": 4});
			this.defineCapability("measure_monetary.next_standing_charge_taxed", {"title": {"en": 'Next Charge (Taxed)'}, "units": {"en": "£", "fr": "€"}, "decimals": 4});
			this.defineCapability("slot_quartile.next_slot_quartile", {"title": {"en": "Next Price Quartile"}});
			this.defineCapability("data_presence.next_day_prices",{"title": {"en": "Tomorrow's Prices"}});
			this.defineCapability("date_time.next_slot_end", {"title": {"en": 'Next Slot End'}});
		}
		if (deviceCount > 0){
			this.defineCapability("item_count.devices", {"title": {"en": 'Device Count'}});
			this.defineCapability("item_count.dispatches", {"title": {"en": 'Planned Dispatches'}});
		}

		await this.applyCapabilities(false);
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
			const tariff = this.getTariffDirectionDetail(direction);
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
	async processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = undefined) {

		let updates = await super.processEvent(atTime, newDay, liveMeterReading, plannedDispatches);

		const direction = this.isExport();
		const eventTime = new Date(atTime);
		const tariff = await this.getTariffDirectionDetail(direction);
		const tariffPrices = await this.getTariffDirectionPrices(atTime, direction);
		const nextTariffPrices = await this.getNextTariffSlotPrices(tariffPrices.nextSlotStart, tariffPrices.isHalfHourly, direction);
		const nextTariffAbsent = nextTariffPrices.unitRate === null;
		const deviceCount = await this.getDeviceCount();
		const dispatchCount = plannedDispatches.length
		const recordedSlotEnd = this.getCapabilityValue("date_time.slot_end");
		const recordedSlotStart = this.getCapabilityValue("date_time.slot_start");
		const firstTime = recordedSlotEnd === null;
		const propertyName = direction ? "export" : "consumption";
		const newEnergyReading = +liveMeterReading[propertyName];																//Wh as integer
		const slotChange = firstTime ? true : (eventTime >= new Date(recordedSlotEnd));					//Boolean
		const duration = firstTime ? 0 : ((eventTime - new Date(recordedSlotStart)) / (60 * 60 * 1000));								//Decimal hours
		const lastEnergyReading = firstTime ? newEnergyReading : 1000 * await this.getCapabilityValue("meter_power");		//Wh
		const slotEnergy = firstTime ? 0 : (1000 * this.getCapabilityValue("meter_power.consumption"));									//Wh
		const slotValue = firstTime ? 0 : this.getCapabilityValue("measure_monetary.energy_value");											//£ Untaxed
		const slotValueTaxed = firstTime ? 0 : this.getCapabilityOptions("measure_monetary.energy_value_taxed");				//£
		const productCode = tariff.productCode;
		const tariffCode = tariff.tariffCode;
		const unitPrice = .01 * tariffPrices.preVatUnitRate;																		//£ Untaxed
		const unitPriceTaxed = .01 * tariffPrices.unitRate;																			//£
		const standingCharge = .01 * tariff.preVatStandingCharge;																//£ Untaxed
		const standingChargeTaxed = .01 * tariff.standingCharge;																//£
		const deltaEnergy = newEnergyReading - lastEnergyReading;																//Wh
		const deltaEnergyValue = unitPrice * (deltaEnergy / 1000);															//Untaxed £.kWh
		const deltaEnergyValueTaxed = unitPriceTaxed * (deltaEnergy / 1000);										//Taxed £.kWh
		const updatedSlotEnergy = (deltaEnergy + (slotChange ? 0 : slotEnergy)) / 1000;					//kWh 
		const updatedSlotValue = deltaEnergyValue + (slotChange ? 0 : slotValue);
		const updatedSlotValueTaxed = deltaEnergyValueTaxed + (slotChange ? 0 : slotValueTaxed);
		const slotPower = (duration > 0) ? 1000 * updatedSlotEnergy / duration : 0;							//W
		const slotQuartile = tariffPrices.quartile;
		const slotStart = tariffPrices.thisSlotStart;																						//ISO
		const slotEnd = tariffPrices.nextSlotStart;																							//ISO
		const nextUnitPrice = nextTariffAbsent ? null : .01 * nextTariffPrices.preVatUnitRate		//£ Untaxed
		const nextUnitPriceTaxed = nextTariffAbsent ? null : .01 * nextTariffPrices.unitRate		//£
		const nextStandingCharge = nextTariffAbsent ? null : .01 * nextTariffPrices.preVatStandingCharge 	//£ Untaxed
		const nextStandingChargeTaxed = nextTariffAbsent ? null : .01* nextTariffPrices.standingCharge		//£
		const nextQuartile = nextTariffAbsent ? null : nextTariffPrices.quartile
		const nextDayPresent = await this.getTomorrowsPricesPresent(atTime, direction);					//Boolean
		const nextSlotEnd = nextTariffAbsent ? null : this.getLocalDateTime(new Date(nextTariffPrices.nextSlotStart)).toISO();

		this.updateCapability("product_code", productCode );
		this.updateCapability("tariff_code", tariffCode);
		this.updateCapability("measure_monetary.unit_price", unitPrice);
		this.updateCapability("measure_monetary.unit_price_taxed", unitPriceTaxed);
		this.updateCapability("measure_monetary.standing_charge", standingCharge);
		this.updateCapability("measure_monetary.standing_charge_taxed", standingChargeTaxed);
		this.updateCapability("meter_power", newEnergyReading / 1000);
		this.updateCapability("meter_power.consumption", updatedSlotEnergy);
		this.updateCapability("measure_monetary.slot_energy_value", updatedSlotValue);
		this.updateCapability("measure_monetary.slot_energy_value_taxed", updatedSlotValueTaxed);
		this.updateCapability("measure_power.average", slotPower);
		this.updateCapability("slot_quartile", slotQuartile);
		this.updateCapability("date_time.slot_start", slotStart);
		this.updateCapability("date_time.slot_end", slotEnd);
		this.updateCapability("data_presence.next_day_prices",nextDayPresent);
		this.updateCapability("measure_monetary.next_unit_price", nextUnitPrice);
		this.updateCapability("measure_monetary.next_unit_price_taxed", nextUnitPriceTaxed);
		this.updateCapability("measure_monetary.next_standing_charge", nextStandingCharge);
		this.updateCapability("measure_monetary.next_standing_charge_taxed", nextStandingChargeTaxed);
		this.updateCapability("slot_quartile.next_slot_quartile",nextQuartile);
		this.updateCapability("date_time.next_slot_end",nextSlotEnd);
		this.updateCapability("item_count.devices", deviceCount);
		this.updateCapability("item_count.dispatches", dispatchCount);

		updates = await this.updateCapabilities(updates);
		return updates;

	}

}