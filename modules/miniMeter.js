'use strict';

const krakenDevice = require("../drivers/krakendevicedriver/device");

module.exports = class miniMeter extends krakenDevice {

	/**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('miniMeter Device:onInit - miniMeter device has been initialized');
  }

    /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('miniMeter Device:onAdded - has been added');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('miniMeter Device:onRenamed - was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('miniMeter Device:onDeleted - has been deleted');
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
    this.log('miniMeter Device:onSettings - settings where changed');
  }

  /**
	 * Process an event for the octopusMini - like an In Home Display.
	 * @param     {string}        atTime            String representation of the event time
	 * @param     {boolean}       newDay            Indicates that any newDay processing should occur
	 * @param     {object - JSON} liveMeterReading  SmartMeterTelemetry {demand, export, consumption, readAt} 
	 * @returns   {boolean}                         Indicates if any updates have been made to the device capabilities
	 */
	async processEvent(atTime, newDay, liveMeterReading = undefined) {
		let updates = await super.processEvent(atTime, newDay, liveMeterReading);

		updates = await this.updateMeterAndPower(
			"export",
			liveMeterReading.export,
			atTime,
			newDay,
			updates
		);

		updates = await this.updateMeterAndPower(
			"import",
			liveMeterReading.consumption,
			atTime,
			newDay,
			updates
		);

		if (updates) {
			await this.setCapabilityValue("event_time", (new Date(atTime)).toISOString());
		}
		return updates;
	}

	/**
	 * Update an energy meter and associated power and monetary capabilities using a new total energy value
	 * @param     {string}        meterName             Meter name shared by all three capabilities
	 * @param     {integer}       eventEnergy           New total energy value (units: kWh)
	 * @param     {string}        atTime                String representation of the event date and time
	 * @param     {boolean}       newDay                Indicates change of day, local time, since the last event
	 * @param     {boolean}       updates               Indicates if any updates have been processed for the device
	 * @returns   {boolean}                             Indicates if capabilities are updated
	 */
	async updateMeterAndPower(meterName, eventEnergy, atTime, newDay, updates) {

		const meterCapability = `meter_power.${meterName}`;
		const powerCapability = `measure_power.${meterName}`;
		const dailyCapability = `meter_power.${meterName}_today`;
		const hourlyCapability = `meter_power.${meterName}_last_hour`;
		const priceCapability = `measure_monetary.${meterName}_price`;
		const valueCapability = `measure_monetary.${meterName}_value`;
		const dailyValueCapability = `measure_monetary.${meterName}_value_today`;
		const hourlyValueCapability = `measure_monetary.${meterName}_value_last_hour`;

		const lastEnergy = 1000 * await this.getCapabilityValue(meterCapability);
		updates = (await this.updateCapabilityValue(meterCapability, eventEnergy / 1000)) || updates;
		let price = 0;

		if (updates) {
			const tariffPrices = await super.getTariffDirectionPrices(atTime, meterName == "export");
			this.homey.log(JSON.stringify(tariffPrices,undefined,2));
			price = tariffPrices.unitRate;
			updates = (await this.updateCapabilityValue(priceCapability, price)) || updates;
		}

		if (lastEnergy !== undefined && (updates || newDay)) {
			const eventTime = new Date(atTime);
			const lastTime = new Date(await this.getCapabilityValue("event_time"));
			const deltaTime = (eventTime.getTime() - lastTime.getTime()) / (60 * 60 * 1000);
			const deltaEnergy = eventEnergy - lastEnergy;
			const power = deltaEnergy / deltaTime;
			const value = deltaEnergy * price / 1000;

			updates = (await this.updateCapabilityValue(powerCapability, power)) || updates;
			updates = (await this.updateCapabilityValue(valueCapability, value)) || updates;

			let dailyEnergy = newDay ? 0 : await this.getCapabilityValue(dailyCapability);
			dailyEnergy += deltaEnergy / 1000;
			updates = (await this.updateCapabilityValue(dailyCapability, dailyEnergy)) || updates;

			let dailyValue = newDay ? 0 : await this.getCapabilityValue(dailyValueCapability);
			dailyValue += value;
			updates = (await this.updateCapabilityValue(dailyValueCapability, dailyValue)) || updates;

			const newHour = this.hourChange(eventTime, lastTime);

			let hourlyEnergy = newHour ? 0 : await this.getCapabilityValue(hourlyCapability);
			hourlyEnergy += deltaEnergy / 1000;
			updates = (await this.updateCapabilityValue(hourlyCapability, hourlyEnergy)) || updates;

			let hourlyValue = newHour ? 0 : await this.getCapabilityValue(hourlyValueCapability);
			hourlyValue += value;
			updates = (await this.updateCapabilityValue(hourlyValueCapability, hourlyValue)) || updates;
		}

		return updates;
	}


}