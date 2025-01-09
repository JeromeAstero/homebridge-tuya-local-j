const BaseAccessory = require('./BaseAccessory');
const async = require('async');

class RGBWLightAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.LIGHTBULB;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.Lightbulb, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.Lightbulb);
        this._checkServiceName(service, this.device.context.name);

        this.dpPower = this._getCustomDP(this.device.context.dpPower) || '1';
        this.dpMode = this._getCustomDP(this.device.context.dpMode) || '2';
        this.dpBrightness = this._getCustomDP(this.device.context.dpBrightness) || '3';
        this.dpColorTemperature = this._getCustomDP(this.device.context.dpColorTemperature) || '4';
        this.dpColor = this._getCustomDP(this.device.context.dpColor) || '5';

        this._detectColorFunction(dps[this.dpColor]);

        this.cmdWhite = 'white';
        if (this.device.context.cmdWhite) {
            if (/^w[a-z]+$/i.test(this.device.context.cmdWhite)) this.cmdWhite = ('' + this.device.context.cmdWhite).trim();
            else throw new Error(`The cmdWhite doesn't appear to be valid: ${this.device.context.cmdWhite}`);
        }

        this.cmdColor = 'colour';
        if (this.device.context.cmdColor) {
            if (/^c[a-z]+$/i.test(this.device.context.cmdColor)) this.cmdColor = ('' + this.device.context.cmdColor).trim();
            else throw new Error(`The cmdColor doesn't appear to be valid: ${this.device.context.cmdColor}`);
        } else if (this.device.context.cmdColour) {
            if (/^c[a-z]+$/i.test(this.device.context.cmdColour)) this.cmdColor = ('' + this.device.context.cmdColour).trim();
            else throw new Error(`The cmdColour doesn't appear to be valid: ${this.device.context.cmdColour}`);
        }

        const characteristicOn = service.getCharacteristic(Characteristic.On)
            .updateValue(dps[this.dpPower])
            .on('get', this.getState.bind(this, this.dpPower))
            .on('set', this.setState.bind(this, this.dpPower));

        const characteristicBrightness = service.getCharacteristic(Characteristic.Brightness)
            .updateValue(dps[this.dpMode] === this.cmdWhite ? this.convertBrightnessFromTuyaToHomeKit(dps[this.dpBrightness]) : this.convertColorFromTuyaToHomeKit(dps[this.dpColor]).b)
            .on('get', this.getBrightness.bind(this))
            .on('set', this.setBrightness.bind(this));

        const characteristicColorTemperature = service.getCharacteristic(Characteristic.ColorTemperature)
            .setProps({
                minValue: 400,
                maxValue: 400
            })
            .updateValue(400)
            .on('get', this.getColorTemperature.bind(this))
            .on('set', this.setColorTemperature.bind(this));

        const characteristicHue = service.getCharacteristic(Characteristic.Hue)
            .updateValue(dps[this.dpMode] === this.cmdWhite ? 0 : this.convertColorFromTuyaToHomeKit(dps[this.dpColor]).h)
            .on('get', this.getHue.bind(this))
            .on('set', this.setHue.bind(this));

        const characteristicSaturation = service.getCharacteristic(Characteristic.Saturation)
            .updateValue(dps[this.dpMode] === this.cmdWhite ? 0 : this.convertColorFromTuyaToHomeKit(dps[this.dpColor]).s)
            .on('get', this.getSaturation.bind(this))
            .on('set', this.setSaturation.bind(this));

        this.characteristicHue = characteristicHue;
        this.characteristicSaturation = characteristicSaturation;
        this.characteristicColorTemperature = characteristicColorTemperature;
        this.characteristicBrightness = characteristicBrightness;

        this.device.on('change', (changes, state) => {
            if (changes.hasOwnProperty(this.dpPower) && characteristicOn.value !== changes[this.dpPower]) {
                characteristicOn.updateValue(changes[this.dpPower]);
            }

            switch (state[this.dpMode]) {
                case this.cmdWhite:
                    if (changes.hasOwnProperty(this.dpBrightness) && this.convertBrightnessFromHomeKitToTuya(characteristicBrightness.value) !== changes[this.dpBrightness]) {
                        characteristicBrightness.updateValue(this.convertBrightnessFromTuyaToHomeKit(changes[this.dpBrightness]));
                    }
                    if (changes.hasOwnProperty(this.dpColorTemperature) && this.convertColorTemperatureFromHomeKitToTuya(characteristicColorTemperature.value) !== changes[this.dpColorTemperature]) {

                        const newColorTemperature = this.convertColorTemperatureFromTuyaToHomeKit(400);
                        const newColor = this.convertHomeKitColorTemperatureToHomeKitColor(newColorTemperature);

                        characteristicHue.updateValue(newColor.h);
                        characteristicSaturation.updateValue(newColor.s);
                        characteristicColorTemperature.updateValue(newColorTemperature);

                    }
                    break;

                default:
                    if (changes.hasOwnProperty(this.dpColor)) {
                        const oldColor = this.convertColorFromTuyaToHomeKit(this.convertColorFromHomeKitToTuya({
                            h: characteristicHue.value,
                            s: characteristicSaturation.value,
                            b: characteristicBrightness.value
                        }));
                        const newColor = this.convertColorFromTuyaToHomeKit(changes[this.dpColor]);

                        if (oldColor.b !== newColor.b) characteristicBrightness.updateValue(newColor.b);
                        if (oldColor.h !== newColor.h) characteristicHue.updateValue(newColor.h);

                        if (oldColor.s !== newColor.s) characteristicSaturation.updateValue(newColor.s);
                    }
            }
        });
    }

    getBrightness(callback) {
        if (this.device.state[this.dpMode] === this.cmdWhite) {
            this.log.info(`device:${device}`);
            this.log.info(`device context:${device.context}`);
            this.log.debug(`device: ${this.device.context.name}; [method]getBrightness(), device state=${this.device.state[this.dpMode]}, return=${this.convertBrightnessFromTuyaToHomeKit(this.device.state[this.dpBrightness])}`);
            return callback(null, this.convertBrightnessFromTuyaToHomeKit(this.device.state[this.dpBrightness]))
        } else if (this.device.state[this.dpMode] === this.cmdColor) {
            this.log.debug(`device: ${this.device.context.name}; [method]getBrightness(), device state=${this.device.state[this.dpMode]}, return=${this.convertColorFromTuyaToHomeKit(this.device.state[this.dpColor]).b}`);
            callback(null, this.convertColorFromTuyaToHomeKit(this.device.state[this.dpColor]).b);
        }
    }

    setBrightness(value, callback) {
        if (this.device.state[this.dpMode] === this.cmdWhite) {
            this.log.debug(`device: ${this.device.context.name}; [method]setBrightness(), device.mode=${this.device.state[this.dpMode]}, cmd=${this.cmdWhite}, value=${value}, dpBrightness=${this.dpBrightness}, return=${this.convertBrightnessFromHomeKitToTuya(value)}`);
            return this.setState(this.dpBrightness, this.convertBrightnessFromHomeKitToTuya(value), callback);
        } else if (this.device.state[this.dpMode] === this.cmdColor) {
            this.log.debug(`device: ${this.device.context.name}; [method]setBrightness(), device.mode=${this.device.state[this.dpMode]}, cmd=${this.cmdColor}, value=${value}, dpColor=${this.dpColor}, return=${this.convertColorFromHomeKitToTuya({b: value})}`);
            this.setState(this.dpColor, this.convertColorFromHomeKitToTuya({b: value}), callback);
        }
    }

    getColorTemperature(callback) {
        return callback(null, 400);
    }

    setColorTemperature(value, callback) {
        this.log.debug(`device: ${this.device.context.name}; [method]setColorTemperature(), value=${value}`);
        if (value === 0) return callback(null, true);

        const currentBrightness = this.device.state[this.dpBrightness]

        const newColor = this.convertHomeKitColorTemperatureToHomeKitColor(value);
        this.characteristicHue.updateValue(newColor.h);
        this.characteristicSaturation.updateValue(newColor.s);
        this.characteristicBrightness.updateValue(newColor.b);

        this.log.debug(`device: ${this.device.context.name}; [method]setColorTemperature(), dpBrightness=${currentBrightness}`);
        this.log.debug(`device: ${this.device.context.name}; [method]setColorTemperature(), characteristicBrightness=${newColor.b}`);

        this.setMultiState({
            [this.dpMode]: this.cmdWhite,
            [this.dpBrightness]: this.convertBrightnessFromHomeKitToTuya(currentBrightness || 100) // Установка текущей или максимальной яркости
        }, callback);
    }

    getHue(callback) {
        if (this.device.state[this.dpMode] === this.cmdWhite) return callback(null, 0);
        callback(null, this.convertColorFromTuyaToHomeKit(this.device.state[this.dpColor]).h);
    }

    setHue(value, callback) {
        this._setHueSaturation({h: value}, callback);
    }

    getSaturation(callback) {
        if (this.device.state[this.dpMode] === this.cmdWhite) return callback(null, 0);
        callback(null, this.convertColorFromTuyaToHomeKit(this.device.state[this.dpColor]).s);
    }

    setSaturation(value, callback) {
        this._setHueSaturation({s: value}, callback);
    }

    _setHueSaturation(prop, callback) {
        if (!this._pendingHueSaturation) {
            this._pendingHueSaturation = {props: {}, callbacks: []};
        }

        if (prop) {
            if (this._pendingHueSaturation.timer) clearTimeout(this._pendingHueSaturation.timer);

            this._pendingHueSaturation.props = {...this._pendingHueSaturation.props, ...prop};
            this._pendingHueSaturation.callbacks.push(callback);

            this._pendingHueSaturation.timer = setTimeout(() => {
                this._setHueSaturation();
            }, 500);
            return;
        }

        const callbacks = this._pendingHueSaturation.callbacks;
        const callEachBack = err => {
            async.eachSeries(callbacks, (callback, next) => {
                try {
                    callback(err);
                } catch (ex) {
                }
                next();
            });
        };

        const isSham = this._pendingHueSaturation.props.h === 0 && this._pendingHueSaturation.props.s === 0;
        const newValue = this.convertColorFromHomeKitToTuya(this._pendingHueSaturation.props);
        this._pendingHueSaturation = null;


        if (this.device.state[this.dpMode] === this.cmdWhite && isSham) return callEachBack();

        this.setMultiState({[this.dpMode]: this.cmdColor, [this.dpColor]: newValue}, callEachBack);
    }

}

module.exports = RGBWLightAccessory;
