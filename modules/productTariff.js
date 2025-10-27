'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");
const { DateTime } = require("luxon");

//TODO: Consider a sub-class of half-hourly priced tariff.  This will implement slot-quartile, data-presence capabilities

module.exports = class productTariff extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		//TODO: Reverse ordering of Tomorrow's Prices and Next Slot Quartile capabilities
		this.log('productTariff Device:onInit - productTariff device has been initialized');
		await super.onInit();

		const isHalfHourly = ('unitRates' in (await this.driver.managerEvent.accountWrapper.getTariffDirection(this.isExport())));
		this.defineStoreValue('isHalfHourly', isHalfHourly);

		this.defineCapability("product_code");
		this.defineCapability("tariff_code");
		this.defineCapability("measure_monetary.unit_price",{"title":{"en": '£/kWh', "fr": '€/kWh',}, "decimals": 4, "units": {"en": "£", "fr": "€",}});
		this.defineCapability("measure_monetary.unit_price_taxed",{"title": {"en": '£/kWh (Taxed)'}, "decimals": 4, "units": {"en": "£",}});
		this.defineCapability("measure_monetary.standing_charge",{"title":{"en": 'Std Charge',},"decimals": 4,"units":{"en": "£",}});
		this.defineCapability("measure_monetary.standing_charge_taxed",{"title":{"en": 'Std Charge (Taxed)',},"decimals": 4,"units":{"en": "£",}});
		this.defineCapability("meter_power",{"title": {"en": 'Cumulative kWh'}, "decimals": 3});
		this.defineCapability("meter_power.consumption",{"title":{"en": 'Slot Energy kWh'}, "decimals": 3});
		this.defineCapability("measure_monetary.energy_value",{"title": {"en": 'Slot Energy £',},"decimals": 4,"units": {"en": "£",}});
		this.defineCapability("measure_monetary.energy_value_taxed",{"title": {"en": 'Slot £ (Taxed)'}, "decimals": 4, "units": {"en": "£",}});
		this.defineCapability("measure_power.average",{"title":{"en": 'Slot Ave. Power'}});
		this.defineCapability("slot_quartile",{"title": {"en": "Price Quartile"}});
		this.defineCapability("date_time.slot_start", {"title":{"en": 'Slot Start'}});
		this.defineCapability("date_time.slot_end",{"title":{"en": 'Slot End',}});
		this.defineCapability("measure_monetary.next_unit_price",{"title":{"en": 'Next £/kWh'},"units": {"en": "£", "fr": "€"},"decimals": 4});
		this.defineCapability("measure_monetary.next_unit_price_taxed",{"title": {"en": 'Next £/kWh (Taxed)',}, "units": {"en": "£", "fr": "€"}, "decimals": 4});
		this.defineCapability("measure_monetary.next_standing_charge", {"title": {"en": 'Next Std Charge'}, "units": {"en": "£","fr": "€"}, "decimals": 4});
		this.defineCapability("measure_monetary.next_standing_charge_taxed", {"title": {"en": 'Next Charge (Taxed)'}, "units": {"en": "£", "fr": "€"}, "decimals": 4});
		this.defineCapability("slot_quartile.next_slot_quartile", {"title": {"en": "Next Price Quartile"}});
		this.defineCapability("data_presence.next_day_prices",{"title": {"en": "Tomorrow's Prices"}});
		this.defineCapability("date_time.next_slot_end", {"title": {"en": 'Next Slot End'}});

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
		this.log('productTariff Device:onSettings - settings where changed');
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
	async processEvent(atTime, newDay, liveMeterReading = undefined) {

		let updates = await super.processEvent(atTime, newDay, liveMeterReading);

		const direction = this.isExport();
		const propertyName = direction ? "export" : "consumption";
		const currentMeterPower = liveMeterReading[propertyName] / 1000;
		const eventTime = new Date(atTime);
		const tariff = await this.getTariffDirectionDetail(direction);
		const prices = await this.getTariffDirectionPrices(atTime, direction);
		const slotStart = new Date(prices.thisSlotStart);
		const nextSlotStart = new Date(prices.nextSlotStart);	
		const slotPriceQuartile = prices.quartile;
		const durationHours = (eventTime - slotStart) / (60 * 60 * 1000);
		const recordedSlotEnd = this.getCapabilityValue("date_time.slot_end");
		const lastMeterPower = this.getCapabilityValue("meter_power");
		const nextPrices = await this.getTariffDirectionPrices(nextSlotStart.toISOString(), direction);
		const nextSlotEnd = new Date(nextPrices.nextSlotStart);
		const nextSlotPriceQuartile = nextPrices.quartile;
		const nextDayPrices = await this.getTomorrowsPricesPresent(atTime, direction);

		let slotChange = true;
		let consumption = 0;
		let averagePower = 0;
		let recordedUnitPrice = 0;
		let recordedUnitPriceTaxed = 0;
		let energyValue = 0;
		let energyValueTaxed = 0;

		const firstTime = recordedSlotEnd === null;

		if (!firstTime) {
			slotChange = eventTime >= new Date(recordedSlotEnd);
			let current_consumption = this.getCapabilityValue("meter_power.consumption");
			consumption = (currentMeterPower - lastMeterPower) + (slotChange ? 0 : current_consumption);		//kWh
			averagePower = 1000 * consumption / durationHours;	//W
			recordedUnitPrice = this.getCapabilityValue("measure_monetary.unit_price");
			recordedUnitPriceTaxed = this.getCapabilityValue("measure_monetary.unit_price_taxed")
			energyValue = consumption * recordedUnitPrice;
			energyValueTaxed = consumption * recordedUnitPriceTaxed;
		}

		this.homey.log(`productTariff.processEvent: EventTime:${eventTime.toISOString()}: recordedSlotEnd:${recordedSlotEnd}: slotChange:${slotChange}`);

		if (true) {
			updates = (await this.updateCapabilityValue("meter_power", currentMeterPower)) || updates;
			updates = (await this.updateCapabilityValue("meter_power.consumption", consumption)) || updates;
			updates = (await this.updateCapabilityValue("measure_power.average", averagePower)) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.energy_value", energyValue)) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.energy_value_taxed", energyValueTaxed)) || updates;
			updates = (await this.updateCapabilityValue("data_presence.next_day_prices", nextDayPrices)) || updates;
		}

		if (firstTime || slotChange || newDay) {
			updates = (await this.updateCapabilityValue("product_code", tariff.productCode)) || updates;
			updates = (await this.updateCapabilityValue("tariff_code", tariff.tariffCode)) || updates;
			updates = (await this.updateCapabilityValue("date_time.slot_start", this.getLocalDateTime(slotStart).toString())) || updates;
			updates = (await this.updateCapabilityValue("date_time.slot_end", this.getLocalDateTime(nextSlotStart).toString())) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.unit_price", .01 * prices.preVatUnitRate)) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.unit_price_taxed", .01 * prices.unitRate)) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.standing_charge", .01 * prices.preVatStandingCharge)) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.standing_charge_taxed", .01 * prices.standingCharge)) || updates;
			updates = (await this.updateCapabilityValue("slot_quartile",slotPriceQuartile)) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.next_unit_price", .01 * nextPrices.preVatUnitRate)) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.next_unit_price_taxed", .01 * nextPrices.unitRate)) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.next_standing_charge", .01 * nextPrices.preVatStandingCharge)) || updates;
			updates = (await this.updateCapabilityValue("measure_monetary.next_standing_charge_taxed", .01 * nextPrices.standingCharge)) || updates;
			updates = (await this.updateCapabilityValue("slot_quartile.next_slot_quartile", nextSlotPriceQuartile)) || updates;
			updates = (await this.updateCapabilityValue("date_time.next_slot_end", this.getLocalDateTime(nextSlotEnd).toString())) || updates;
		}

		return updates;

	}

}