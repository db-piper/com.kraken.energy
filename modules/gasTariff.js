'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class gasTariff extends krakenDevice {
  async onInit() {
    this.log('gasTariff Device:onInit - gasTariff Initialization Started');
    await super.onInit();

    this.defineCapability(this._capIds.PRODUCT_CODE);
    this.defineCapability(this._capIds.TARIFF_CODE);
    this.defineCapability(this._capIds.UNIT_PRICE_PAID, { "title": { "en": '£/kWh Paid' }, "decimals": 5, "units": { "en": "£/kWh" } }, ['title', 'decimals', 'units']);
    this.defineCapability(this._capIds.STANDING_CHARGE, { "title": { "en": 'Daily Charge', }, "decimals": 5, "units": { "en": "£", } });
    this.defineCapability(this._capIds.METER_READING, { "title": { "en": 'Total Energy' }, "decimals": 3, "units": { "en": "kWh" } }, ['title', 'decimals', 'units']);
    this.defineCapability(this._capIds.DAY_CONSUMPTION, { "title": { "en": 'Daily Consumption' }, "decimals": 3, "units": { "en": "kWh" } }, ['title', 'decimals', 'units']);
    this.defineCapability(this._capIds.TAX_RATE, { "title": { "en": "Tax Rate" } });
    this.defineCapability(this._capIds.DAY_ENERGY_VALUE, { "title": { "en": 'Day Energy Cost' }, "decimals": 4, "units": { "en": "£" } }, ['title', 'decimals', 'units']);
    this.defineCapability(this._capIds.CHUNK_ENERGY, { "title": { "en": "Chunk Energy" }, "decimals": 3 });
    this.defineCapability(this._capIds.CHUNK_VALUE, { "title": { "en": "Chunk Cost" }, "decimals": 2, "units": { "en": "£" } });

    await this.applyCapabilities();
    await this.applyStoreValues();

    this.log('gasTariff Device:onInit - gasTariff Initialization Completed');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    super.onAdded();
    this.log('gasTariff Device:onAdded - has been added');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('gasTariff Device:onRenamed - was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('gasTariff Device:onDeleted - has been deleted');
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
   * @param			{object}				gasTariff				  Gas tariff object from Kraken
   * @param			{object}				devices						Map of devices from Kraken
   * @param			{object}				deviceStates			Map of device current states from Kraken
   * @returns   {Promise<boolean>}                Indicates if any updates are queued to the device capabilities
   */
  processEvent(atTimeMillis, periodChanges, liveMeterReading = undefined, plannedDispatches = {}, account = undefined, importTariff = undefined, exportTariff = undefined, gasTariff = undefined, devices = undefined, deviceStates = undefined) {

    let updates = super.processEvent(atTimeMillis, periodChanges, liveMeterReading, plannedDispatches, account, importTariff, exportTariff, gasTariff, devices, deviceStates);

    const firstTime = null === this.readCapabilityValue(this._capIds.PRODUCT_CODE);
    const currentReading = Math.floor(gasTariff.reading);                                                         // Wh integer
    const lastReading = firstTime ? currentReading : 1000 * this.readCapabilityValue(this._capIds.METER_READING); // Wh
    const lastdayReading = 1000 * this.readCapabilityValue(this._capIds.DAY_CONSUMPTION) || 0;                    // Wh
    const consumptionDelta = currentReading - lastReading;                                                        // Wh
    const dayReading = consumptionDelta + (periodChanges.day ? 0 : lastdayReading);                               // Wh
    const dayValue = (.001 * dayReading) * (.01 * gasTariff.unitRate);                                            // £      

    this.updateCapability(this._capIds.PRODUCT_CODE, gasTariff.productCode);
    this.updateCapability(this._capIds.TARIFF_CODE, gasTariff.tariffCode);
    this.updateCapability(this._capIds.UNIT_PRICE_PAID, .01 * gasTariff.unitRate);                    // £/kWh  
    this.updateCapability(this._capIds.STANDING_CHARGE, .01 * gasTariff.standingCharge);              // £/day   
    this.updateCapability(this._capIds.METER_READING, .001 * currentReading);                         // kWh
    this.updateCapability(this._capIds.DAY_CONSUMPTION, .001 * dayReading);                           // kWh
    this.updateCapability(this._capIds.TAX_RATE, gasTariff.taxRate);
    this.updateCapability(this._capIds.DAY_ENERGY_VALUE, dayValue);                                   // £
    this.updateCapability(this._capIds.CHUNK_ENERGY, .001 * consumptionDelta);                        // kWh
    this.updateCapability(this._capIds.CHUNK_VALUE, .01 * consumptionDelta * gasTariff.unitRate);     // £

    return updates;
  }
}