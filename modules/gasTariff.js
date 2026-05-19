'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class gasTariff extends krakenDevice {
  async onInit() {
    this.log('gasTariff Device:onInit - gasTariff Initialization Started');
    await super.onInit();

    this.defineCapability(this._capIds.PRODUCT_CODE);
    this.defineCapability(this._capIds.TARIFF_CODE);

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

    this.updateCapability(this._capIds.PRODUCT_CODE, gasTariff.productCode);
    this.updateCapability(this._capIds.TARIFF_CODE, gasTariff.tariffCode);

    return updates;
  }
}