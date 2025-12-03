'use strict';

const Homey = require('homey');
const productTariff = require('./modules/productTariff');

module.exports = class krakenApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.homey.log('krakenApp.onInit: App has been initialized');
    this.registerConditionRunListener('slot_relative_price', productTariff.prototype.getCurrentlyCheaper);
  }

  /**
   * Register the specified function on the device class as the listener for the named condition flow card 
   * @param {string}   cardName           The name of the condition card getting the listener
   * @param {function} handlerFunction    The function
   */
  registerConditionRunListener(cardName, handlerFunction) {
    this.homey.log(`krakenApp.registerConditionRunListener: card ${cardName} function: ${handlerFunction.name}`);
    this.homey.flow.getConditionCard(cardName).registerRunListener(this.runListenerExecutor.bind(this, handlerFunction));
  }

  /**
   * Run the specified function in the context of the object referenced in args.device with args as parameter
   * @param {function}  handlerFunction   The handler function
   * @param {object}    args              args.device is the device instance 
   * @param {object}    state             Current homey state 
   * @returns 
   */
  async runListenerExecutor(handlerFunction, args, state) {
    this.homey.log(`krakenApp.runListenerExecutor: ${handlerFunction.name}`)
    //const result = args.device[handlerFunction.name](args);
    const result = handlerFunction.call(args.device, args);
    return result;
  }

  /**
   * onUninit is called when the app is terminating.
   */
  async onUninit() {
    this.log('krakenApp.onUninit: App has been terminated');
  }

};
