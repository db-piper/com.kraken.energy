'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class productTariff extends krakenDevice {

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit() {
		this.log('productTariff Device:onInit - productTariff Initialization Started');
		await super.onInit();

		const isHalfHourly = this.isHalfHourly;
		const isDispatchable = this.isDispatchable;
		const slotLabelWord = isHalfHourly ? "Slot" : "Day";

		this.defineCapability(this._capIds.PRODUCT_CODE);
		this.defineCapability(this._capIds.TARIFF_CODE);
		this.defineCapability(this._capIds.UNIT_PRICE_PAID, { "title": { "en": '£/kWh Paid' }, "decimals": 4, "units": { "en": "£", } }, ['title', 'decimals']);
		this.defineCapability(this._capIds.STANDING_CHARGE, { "title": { "en": 'Daily Charge', }, "decimals": 4, "units": { "en": "£", } });
		this.defineCapability(this._capIds.METER_READING, { "title": { "en": 'Cumulative kWh' }, "decimals": 3 });
		this.defineCapability(this._capIds.SLOT_ENERGY_CONSUMPTION, { "title": { "en": `${slotLabelWord} Energy kWh` }, "decimals": 3 });
		this.defineCapability(this._capIds.SLOT_ENERGY_VALUE, { "title": { "en": `${slotLabelWord} Energy £ ` }, "decimals": 4, "units": { "en": "£", } });
		this.defineCapability(this._capIds.AVERAGE_POWER, { "title": { "en": `${slotLabelWord} Ave. Power` } });
		this.defineCapability(this._capIds.SLOT_QUARTILE, { "title": { "en": "Price Quartile" } }, [], isHalfHourly);
		this.defineCapability(this._capIds.TAX_RATE, { "title": { "en": "Tax Rate" } });
		this.defineCapability(this._capIds.SLOT_START_TIME, { "title": { "en": `${slotLabelWord} Start` } });
		this.defineCapability(this._capIds.SLOT_END_TIME, { "title": { "en": `${slotLabelWord} End`, } });
		this.defineCapability(this._capIds.NEXT_UNIT_PRICE, { "title": { "en": 'Next £/kWh', }, "units": { "en": "£", "fr": "€" }, "decimals": 4 }, [], isHalfHourly);
		this.defineCapability(this._capIds.NEXT_SLOT_QUARTILE, { "title": { "en": "Next Price Quartile" } }, [], isHalfHourly);
		this.defineCapability(this._capIds.NEXT_DAY_PRICES_INDICATOR, { "title": { "en": "Tomorrow's Prices" } }, [], isHalfHourly);
		this.defineCapability(this._capIds.NEXT_SLOT_END_TIME, { "title": { "en": 'Next Slot End' } }, [], isHalfHourly);
		this.defineCapability(this._capIds.DISPATCH_PRICING_INDICATOR, { "title": { "en": "Dispatch Pricing" } }, [], isDispatchable);
		this.defineCapability(this._capIds.UNIT_PRICE_TARIFF, { "title": { "en": '£/kWh Tariff' }, "decimals": 4, "units": { "en": "£", } }, [], isDispatchable);
		this.defineCapability(this._capIds.DISPATCH_LIMIT_PERCENT, { "title": { "en": "Dispatch Limit" }, "decimals": 1, "units": { "en": "%" } }, ['title', 'decimals'], isDispatchable);
		this.defineCapability(this._capIds.SLOT_START_DATETIME, { "title": { "en": "SlotStartH" }, "uiComponent": null }, []);
		this.defineCapability(this._capIds.SLOT_END_DATETIME, { "title": { "en": "SlotEndH" }, "uiComponent": null }, []);

		await this.applyCapabilities();
		await this.applyStoreValues();

		this.log('productTariff Device:onInit - productTariff Initialization Completed');

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
	 * Indicate if the current product tariff is an export product tariff
	 * @returns {boolean}           True if the product tariff is export, false otherwise
	 */
	get isExport() {
		const isExport = this.getStoreValue("isExport");
		return isExport;
	}

	/**
	 * Indicate if the current product tariff is a half hourly tariff
	 * @returns {boolean}           True if the product tariff is export, false otherwise
	 */
	get isHalfHourly() {
		const isHalfHourly = this.getStoreValue("isHalfHourly");
		return isHalfHourly;
	}

	/**
	 * Indicate if the current product tariff is a half hourly tariff
	 * @returns {boolean}           True if the product tariff is export, false otherwise
	 */
	get isDispatchable() {
		const isDispatchable = this.getStoreValue("isDispatchable");
		return isDispatchable;
	}

	/**
	 * Ensure the set of store values is complete for each device
	 * @returns {promise<void>}
	 */
	async migrateStore() {
		await super.migrateStore();
		const keys = this.getStoreKeys();
		const updates = [];

		if (!keys.includes("isHalfHourly")) {
			const isHH = this.hasCapabilityWithId(this._capIds.NEXT_DAY_PRICES_INDICATOR);
			updates.push(this.setStoreValue("isHalfHourly", isHH));
		}

		if (!keys.includes("isDispatchable")) {
			const isDispatch = this.hasCapabilityWithId(this._capIds.DISPATCH_PRICING_INDICATOR);
			updates.push(this.setStoreValue("isDispatchable", isDispatch));
		}

		if (updates.length > 0) {
			await Promise.all(updates);
			this.log(`Migration: Store updated for legacy productTariff`);
		}
	}

	/**
	 * Indicate if the current kWh slot price is less than the next kWh slot price
	 * Used as the run listener for the slot_relative_price condition card
	 * @returns {boolean}			True iff currentPrice < nextPrice
	 */
	getCurrentlyCheaper() {
		this.homey.log(`productTariff.getCurrentlyCheaper: Starting`);
		const currentPrice = this.readCapabilityValue(this._capIds.UNIT_PRICE_TARIFF);
		const nextPrice = this.readCapabilityValue(this._capIds.NEXT_UNIT_PRICE);
		return currentPrice < nextPrice;
	}

	/**
	 * Indicate if the current kWh price paid is less than the slot kWh price (discounted dispatch in force)
	 * Used as the run listener for the price_less_than_tariff condition card
	 * @returns {boolean}			True iff pricePaid < tariffPrice
	 */
	getPriceLessThanTariff() {
		this.homey.log(`productTariff.getPriceLessThanTariff: Starting`);
		const pricePaid = this.readCapabilityValue(this._capIds.UNIT_PRICE_PAID);
		const tariffPrice = this.readCapabilityValue(this._capIds.UNIT_PRICE_TARIFF);
		return pricePaid < tariffPrice;
	}

	/**
	 * Process an event for the tariff.
	 * @param     {string}        atTime            String representation of the event time
	 * @param     {boolean}       newDay            Indicates that any newDay processing should occur
	 * @param     {object - JSON} liveMeterReading  SmartMeterTelemetry {demand, export, consumption, readAt} 
	 * @returns   {boolean}                         Indicates if any updates have been made to the device capabilities
	 */
	processEvent(atTime, newDay, liveMeterReading = undefined, plannedDispatches = {}, accountData = undefined) {

		let updates = super.processEvent(atTime, newDay, liveMeterReading, plannedDispatches, accountData);

		const direction = this.isExport;
		const isDispatchable = this.accountWrapper.getDeviceIds(accountData).length > 0;
		const eventTime = new Date(atTime);
		const tariff = this.accountWrapper.getTariffDirection(direction, accountData);
		const tariffPrices = this.accountWrapper.getTariffDirectionPrices(atTime, direction, accountData);
		const priorPricePaid = this.readCapabilityValue(this._capIds.UNIT_PRICE_PAID);
		const nextTariffPrices = this.accountWrapper.getNextTariffSlotPrices(tariffPrices.nextSlotStart, tariffPrices.isHalfHourly, direction, accountData);
		const nextTariffAbsent = nextTariffPrices.unitRate === null;
		const recordedSlotEnd = this.readCapabilityValue(this._capIds.SLOT_END_DATETIME);
		const recordedSlotStart = this.readCapabilityValue(this._capIds.SLOT_START_DATETIME);
		const firstTime = recordedSlotEnd === null;
		const propertyName = direction ? "export" : "consumption";
		const newEnergyReading = +liveMeterReading[propertyName];																															//Wh as integer
		const slotChange = firstTime ? true : (eventTime >= new Date(recordedSlotEnd));																				//Boolean
		const duration = firstTime ? 0 : ((eventTime - new Date(recordedSlotStart)) / (60 * 60 * 1000));											//Decimal hours
		const lastEnergyReading = firstTime ? newEnergyReading : 1000 * this.readCapabilityValue(this._capIds.METER_READING);	//Wh
		const slotEnergy = firstTime ? 0 : (1000 * this.readCapabilityValue(this._capIds.SLOT_ENERGY_CONSUMPTION));						//Wh
		const slotValueTaxed = firstTime ? 0 : this.readCapabilityValue(this._capIds.SLOT_ENERGY_VALUE);											//£
		const productCode = tariff.productCode;
		const tariffCode = tariff.tariffCode;
		const taxRate = 100 * (tariffPrices.unitRate - tariffPrices.preVatUnitRate) / tariffPrices.preVatUnitRate;		//%
		const minPrice = this.accountWrapper.minimumPriceOnDate(atTime, direction, accountData);
		const currentDispatch = this.getCurrentDispatch(atTime, plannedDispatches)
		const inDispatch = currentDispatch !== undefined;
		//const totalDispatchMinutes = this.getTotalDispatchMinutes();
		const percentDispatchLimit = 100 * this.getTotalDispatchMinutes() / this.getSettings().dispatchMinutesLimit;
		const tariffPrice = .01 * tariffPrices.unitRate;
		const unitPriceTaxed = .01 * ((inDispatch && isDispatchable && percentDispatchLimit < 100) ? minPrice : tariffPrices.unitRate);							//£	
		this.homey.log(`productTariff.processEvent: prices: ${JSON.stringify(tariffPrices)} tariffPrice: ${tariffPrice} unitPriceTaxed: ${unitPriceTaxed}`);
		const standingChargeTaxed = .01 * tariff.standingCharge;																		//£
		const deltaEnergy = newEnergyReading - lastEnergyReading;																		//Wh
		//The prior price paid is used to calculate the value of the energy consumed in the previous tick
		const deltaEnergyValueTaxed = priorPricePaid * (deltaEnergy / 1000);												//£
		const updatedSlotEnergy = (deltaEnergy + (slotChange ? 0 : slotEnergy)) / 1000;							//kWh 
		const updatedSlotValueTaxed = deltaEnergyValueTaxed + (slotChange ? 0 : slotValueTaxed);		//£
		const slotPower = (duration > 0) ? 1000 * updatedSlotEnergy / duration : 0;									//W
		const slotQuartile = (inDispatch && isDispatchable && percentDispatchLimit < 100) ? 0 : tariffPrices.quartile;
		const slotStart = tariffPrices.thisSlotStart;															//ISO
		const shortStart = this.accountWrapper.getLocalDateTime(new Date(slotStart)).toFormat("dd/LL T");
		const slotEnd = tariffPrices.nextSlotStart;
		const shortEnd = this.accountWrapper.getLocalDateTime(new Date(slotEnd)).toFormat("dd/LL T");			//ISO
		const nextUnitPriceTaxed = nextTariffAbsent ? null : .01 * nextTariffPrices.unitRate;					//£
		const nextQuartile = nextTariffAbsent ? null : nextTariffPrices.quartile;
		const nextDayPresent = this.accountWrapper.getTomorrowsPricesPresent(atTime, direction, accountData);			//Boolean
		const nextSlotEnd = nextTariffAbsent ? null : nextTariffPrices.nextSlotStart;							//ISO
		let shortNextEnd = null;
		if (!nextTariffAbsent) {
			shortNextEnd = this.accountWrapper.getLocalDateTime(new Date(nextSlotEnd)).toFormat("dd/LL T");
		}

		this.updateCapability(this._capIds.PRODUCT_CODE, productCode);
		this.updateCapability(this._capIds.TARIFF_CODE, tariffCode);
		this.updateCapability(this._capIds.UNIT_PRICE_PAID, unitPriceTaxed);
		this.updateCapability(this._capIds.STANDING_CHARGE, standingChargeTaxed);
		this.updateCapability(this._capIds.METER_READING, newEnergyReading / 1000);
		this.updateCapability(this._capIds.SLOT_ENERGY_CONSUMPTION, updatedSlotEnergy);
		this.updateCapability(this._capIds.SLOT_ENERGY_VALUE, updatedSlotValueTaxed);
		this.updateCapability(this._capIds.AVERAGE_POWER, slotPower);
		this.updateCapability(this._capIds.SLOT_QUARTILE, slotQuartile);
		this.updateCapability(this._capIds.TAX_RATE, taxRate);
		this.updateCapability(this._capIds.SLOT_START_TIME, shortStart);
		this.updateCapability(this._capIds.SLOT_START_DATETIME, slotStart);
		this.updateCapability(this._capIds.SLOT_END_TIME, shortEnd);
		this.updateCapability(this._capIds.SLOT_END_DATETIME, slotEnd);
		this.updateCapability(this._capIds.NEXT_DAY_PRICES_INDICATOR, nextDayPresent);
		this.updateCapability(this._capIds.NEXT_UNIT_PRICE, nextUnitPriceTaxed);
		this.updateCapability(this._capIds.NEXT_SLOT_QUARTILE, nextQuartile);
		this.updateCapability(this._capIds.NEXT_SLOT_END_TIME, shortNextEnd);
		this.updateCapability(this._capIds.DISPATCH_PRICING_INDICATOR, inDispatch);
		this.updateCapability(this._capIds.UNIT_PRICE_TARIFF, tariffPrice);
		this.updateCapability(this._capIds.DISPATCH_LIMIT_PERCENT, percentDispatchLimit);

		return updates;

	}

}