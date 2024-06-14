const BaseAccessory = require('./BaseAccessory');
const async = require('async');

class DoorbellAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.ContactSensor;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.ContactSensor, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.ContactSensor);
        this._checkServiceName(service, this.device.context.name);

        this.dpDoorbellActive = this._getCustomDP(this.device.context.dpDoorbellActive) || '1';
        this.dpDoorUnlock = this._getCustomDP(this.device.context.dpDoorUnlock) || '2';
        this.dpChannel = this._getCustomDP(this.device.context.dpChannel) || '3';

        const characteristicContactSensorState = service.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
            .setProps({
                minValue: 0,
                maxValue: 1
            })
            .updateValue(dps[this.dpDoorUnlock] === 'false' ? 0 : 1)
            .on('get', this.getContactSensorState.bind(this));

        this.characteristicProgrammableSwitchEvent = characteristicContactSensorState;

        // Обработчик изменения состояния устройства для проброса параметров в HomeKit
        this.device.on('change', (changes, state) => {
            if (changes.hasOwnProperty(this.dpDoorUnlock)) {
                characteristicContactSensorState.getValue((err, value) => {
                    if (!err && value !== changes[this.dpDoorUnlock]) {
                        characteristicContactSensorState.updateValue(changes[this.dpDoorUnlock]);
                    }
                });
            }
        });
    }


    getContactSensorState(callback){
        this.log.info(`getProgrammableSwitchEvent: start`);
        /*if (this.device.state[this.dpDoorbellActive]){
            this.log.info(`[getProgrammableSwitchEvent]: device has dpDoorbellActive? ${this.device.state[this.dpDoorbellActive]}`);
            return callback(null, 0);
        }*/
        const currentValue = this.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
        return callback(null, currentValue);
    }
}

module.exports = DoorbellAccessory;