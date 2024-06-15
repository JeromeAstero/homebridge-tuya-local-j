const BaseAccessory = require('./BaseAccessory');
const async = require('async');

class DoorbellAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.MotionSensor;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.MotionSensor, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.MotionSensor);
        this._checkServiceName(service, this.device.context.name);

        this.dpDoorbellActive = this._getCustomDP(this.device.context.dpDoorbellActive) || '1';
        this.dpDoorUnlock = this._getCustomDP(this.device.context.dpDoorUnlock) || '2';
        this.dpChannel = this._getCustomDP(this.device.context.dpChannel) || '3';

        const characteristicMotionDetected = service.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
            .updateValue(dps[this.dpDoorUnlock])
            .on('get', this.getMotionDetected.bind(this));

        this.characteristicProgrammableSwitchEvent = characteristicMotionDetected;

        // Обработчик изменения состояния устройства для проброса параметров в HomeKit
        this.device.on('change', (changes, state) => {
            if (changes.hasOwnProperty(this.dpDoorUnlock)) {
                characteristicMotionDetected.getValue((err, value) => {
                    if (!err && value !== changes[this.dpDoorUnlock]) {
                        characteristicMotionDetected.updateValue(1);
                    }
                });
            }
        });
    }


    getMotionDetected(callback){
        this.log.info(`getProgrammableSwitchEvent: start`);
        /*if (this.device.state[this.dpDoorbellActive]){
            this.log.info(`[getProgrammableSwitchEvent]: device has dpDoorbellActive? ${this.device.state[this.dpDoorbellActive]}`);
            return callback(null, 0);
        }*/
        const lockValue = this.device.state[this.dpDoorUnlock];
        this.log.info(`lockValue: ${lockValue}`);
        return callback(null, null);
    }
}

module.exports = DoorbellAccessory;