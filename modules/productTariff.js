'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");
const krakenAccountWrapper = require("./krakenAccountWrapper");
const { DateTime } = require('../bundles/luxon');

module.exports = class productTariff extends krakenDevice {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('productTariff Device:onInit - productTariff Initialization Started');
    await super.onInit();

    if (this.getCapabilities().length === 0) {
      await this.setSettings({
        energy_exclude: true,
        energy_cumulative_include: false
      });
    }

    //TODO: this.isDispatchable and this.isHalfHourly are set at device creation but are not updated
    //TODO: if the user changes the tariff to one with different characteristics.  Capabilities will
    //TODO: need to be added or removed accordingly.

    const isHalfHourly = this.isHalfHourly;
    const isDispatchable = this.isDispatchable;
    const slotLabelWord = isHalfHourly ? "Slot" : "Day";
    this.log(`productTariff Device:onInit - isHalfHourly: ${isHalfHourly}, isDispatchable: ${isDispatchable}, slotLabelWord: ${slotLabelWord}`);

    this.defineCapability(this._capIds.PRODUCT_CODE);
    this.defineCapability(this._capIds.TARIFF_CODE);
    this.defineCapability(this._capIds.UNIT_PRICE_PAID, { "title": { "en": '£/kWh Paid' }, "decimals": 4, "units": { "en": "£", } }, ['title', 'decimals', 'units']);
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
    this.defineCapability(this._capIds.TOTAL_DISPATCHED_MINUTES, { "title": { "en": "Total Dispatched Minutes" }, "decimals": 0, "units": { "en": "mn" } }, ['title', 'decimals'], isDispatchable);
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
    super.onAdded();
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
   * PURE CALCULATION: Increments dispatch minutes with a mandatory reset flag.
   * @param   {number}  currentTotal  The existing capability value.
   * @param   {boolean} isNewDay      Flag indicating the first tick of a new calendar day.
   * @param   {number}  interval      The variable minutes from getEventIntervalMinutes.
   * @param   {object}  dispatchMap   The raw Kraken dispatches.
   * @param   {number}  eventMillis   The 'Now' of the poll for the isActive check.
   * @returns {number}                The new total for today.
   */
  calculateDispatchTotal(currentTotal, isNewDay, interval, dispatchMap, eventMillis) {
    let baseTotal = isNewDay ? 0 : currentTotal;
    let activeCount = 0;
    for (const id in dispatchMap) {
      const isActive = (dispatchMap[id] || []).some(dispatch => {
        const start = Date.parse(dispatch.start);
        const end = Date.parse(dispatch.end);
        return eventMillis > start && eventMillis <= end;
      });
      if (isActive) activeCount++;
    }
    return baseTotal + (activeCount * interval);
  }

  /**
   * Process an event on a Product Tariff device
   * @param     {number}        atTimeMillis      Event time in milliseconds since the epoch
   * @param     {object}        periodChanges     Indicates periods have changed (chunk, tariffslot, day and period)
   * @param     {object - JSON} liveMeterReading  SmartMeterTelemetry {demand, export, consumption, readAt}
   * @param			{object[]}			plannedDispatches	Array of planned dispatches by device
   * @param			{object}				account						Account abstract from Kraken
   * @param			{object}				importTariff			Import tariff object from Kraken
   * @param			{object}				exportTariff			Export tariff object from Kraken
   * @param			{object}				devices						Map of devices from Kraken
   * @param			{object}				deviceStates			Map of device current states from Kraken
   * @returns   {Promise<boolean>}                Indicates if any updates are queued to the device capabilities
   */
  processEvent(atTimeMillis, periodChanges, liveMeterReading = undefined, plannedDispatches = {}, account = undefined, importTariff = undefined, exportTariff = undefined, devices = undefined, deviceStates = undefined) {

    let updates = super.processEvent(atTimeMillis, periodChanges, liveMeterReading, plannedDispatches, account, importTariff, exportTariff, devices, deviceStates);

    const isDispatchable = this.isDispatchable;
    const direction = this.isExport;
    const tariff = direction ? exportTariff : importTariff;
    const propertyName = direction ? "export" : "consumption";
    const minPrice = tariff.minimumPriceToday;
    const maxPrice = tariff.maximumPriceToday;
    const unitRate = tariff.unitRate;
    const tariffSlotQuartile = tariff.slotQuartile;

    const priorPricePaid = this.readCapabilityValue(this._capIds.UNIT_PRICE_PAID);
    const recordedSlotEnd = this.readCapabilityValue(this._capIds.SLOT_END_DATETIME);
    const recordedSlotStart = this.readCapabilityValue(this._capIds.SLOT_START_DATETIME);
    const priorDispatchedMinutes = this.readCapabilityValue(this._capIds.TOTAL_DISPATCHED_MINUTES);

    const firstTime = recordedSlotEnd === null;
    const slotEnergy = firstTime ? 0 : (1000 * this.readCapabilityValue(this._capIds.SLOT_ENERGY_CONSUMPTION));						//Wh
    const slotValueTaxed = firstTime ? 0 : this.readCapabilityValue(this._capIds.SLOT_ENERGY_VALUE);											//£
    const slotChange = firstTime || (direction ? periodChanges.tariffSlotExport : periodChanges.tariffSlotImport);

    const newEnergyReading = +liveMeterReading[propertyName];																															//Wh as integer
    const slotDuration = firstTime ? 0 : ((atTimeMillis - Date.parse(recordedSlotStart)) / (60 * 60 * 1000));							//Decimal hours
    const lastEnergyReading = firstTime ? newEnergyReading : 1000 * this.readCapabilityValue(this._capIds.METER_READING);	//Wh
    const currentDispatch = this.getCurrentDispatch(atTimeMillis, plannedDispatches);
    const inDispatch = currentDispatch !== undefined;
    const discountDispatch = inDispatch && currentDispatch.type !== "BOOST";
    const dispatchPrice = discountDispatch ? minPrice : maxPrice;
    const totalDispatchedMinutes = this.calculateDispatchTotal(priorDispatchedMinutes, periodChanges.day, eventInterval, plannedDispatches, atTimeMillis);
    const percentDispatchLimit = 100 * totalDispatchedMinutes / this.getSettings().dispatchMinutesLimit;
    const unitPriceTaxed = .01 * ((isDispatchable && inDispatch && percentDispatchLimit < 100) ? dispatchPrice : unitRate);							//£	
    const deltaEnergy = newEnergyReading - lastEnergyReading;																		//Wh
    const deltaEnergyValueTaxed = priorPricePaid * (deltaEnergy / 1000);												//£
    const updatedSlotEnergy = (deltaEnergy + (slotChange ? 0 : slotEnergy)) / 1000;							//kWh 
    const updatedSlotValueTaxed = deltaEnergyValueTaxed + (slotChange ? 0 : slotValueTaxed);		//£
    const slotPower = (slotDuration > 0) ? 1000 * updatedSlotEnergy / slotDuration : 0;									//W
    const dispatchQuartile = discountDispatch ? 0 : 3;
    const slotQuartile = (inDispatch && isDispatchable && percentDispatchLimit < 100) ? dispatchQuartile : tariffSlotQuartile;

    this.updateCapability(this._capIds.UNIT_PRICE_PAID, unitPriceTaxed);
    this.updateCapability(this._capIds.METER_READING, newEnergyReading / 1000);
    this.updateCapability(this._capIds.SLOT_ENERGY_CONSUMPTION, updatedSlotEnergy);
    this.updateCapability(this._capIds.SLOT_ENERGY_VALUE, updatedSlotValueTaxed);
    this.updateCapability(this._capIds.AVERAGE_POWER, slotPower);
    this.updateCapability(this._capIds.SLOT_QUARTILE, slotQuartile);
    this.updateCapability(this._capIds.DISPATCH_PRICING_INDICATOR, inDispatch);
    this.updateCapability(this._capIds.TOTAL_DISPATCHED_MINUTES, totalDispatchedMinutes);
    this.updateCapability(this._capIds.DISPATCH_LIMIT_PERCENT, percentDispatchLimit);
    this.updateCapability(this._capIds.PRODUCT_CODE, tariff.productCode);
    this.updateCapability(this._capIds.TARIFF_CODE, tariff.tariffCode);
    this.updateCapability(this._capIds.STANDING_CHARGE, .01 * tariff.standingCharge);
    this.updateCapability(this._capIds.TAX_RATE, tariff.taxRate);
    this.updateCapability(this._capIds.SLOT_START_TIME, tariff.slotStartShort);
    this.updateCapability(this._capIds.SLOT_START_DATETIME, tariff.slotStart);
    this.updateCapability(this._capIds.SLOT_END_TIME, tariff.slotEndShort);
    this.updateCapability(this._capIds.SLOT_END_DATETIME, tariff.slotEnd);
    this.updateCapability(this._capIds.NEXT_DAY_PRICES_INDICATOR, tariff.hasTomorrowsPrices);
    this.updateCapability(this._capIds.NEXT_UNIT_PRICE, .01 * tariff.nextUnitPrice);
    this.updateCapability(this._capIds.NEXT_SLOT_QUARTILE, tariff.nextSlotQuartile);
    this.updateCapability(this._capIds.NEXT_SLOT_END_TIME, tariff.nextSlotEndShort);
    this.updateCapability(this._capIds.UNIT_PRICE_TARIFF, .01 * tariff.unitRate);

    return updates;

  }

}