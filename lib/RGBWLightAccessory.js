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
        this.dpColor = this._getCustomDP(this.device.context.dpColor) || '4';

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

        this.device.on('change', (changes, state) => {
            setTimeout(() => {
                // Логика синхронизации характеристик
                if (state[this.dpMode] === this.cmdWhite) {
                    characteristicBrightness.updateValue(this.convertBrightnessFromTuyaToHomeKit(state[this.dpBrightness]));
                    characteristicHue.updateValue(0);
                    characteristicSaturation.updateValue(0);
                    characteristicColorTemperature.updateValue(400);
                } else if (state[this.dpMode] === this.cmdColor) {
                    const color = this.convertColorFromTuyaToHomeKit(state[this.dpColor]);
                    characteristicBrightness.updateValue(color.b);
                    characteristicHue.updateValue(color.h);
                    characteristicSaturation.updateValue(color.s);
                }
            }, 100); // Задержка для корректной синхронизации (при необходимости)

            if (changes.hasOwnProperty(this.dpPower) && characteristicOn.value !== changes[this.dpPower]) {
                characteristicOn.updateValue(changes[this.dpPower]);

                if (changes[this.dpPower]) { // Если устройство включено
                    // Принудительная синхронизация характеристик
                    if (state[this.dpMode] === this.cmdWhite) {
                        const brightness = this.convertBrightnessFromTuyaToHomeKit(state[this.dpBrightness]);
                        const colorTemperature = this.convertColorTemperatureFromTuyaToHomeKit( 400);
                        characteristicBrightness.updateValue(brightness);
                        characteristicHue.updateValue(0);
                        characteristicSaturation.updateValue(0);
                        characteristicColorTemperature.updateValue(colorTemperature);
                    } else if (state[this.dpMode] === this.cmdColor) {
                        const color = this.convertColorFromTuyaToHomeKit(state[this.dpColor]);
                        characteristicBrightness.updateValue(color.b);
                        characteristicHue.updateValue(color.h);
                        characteristicSaturation.updateValue(color.s);
                    }
                }
            }

            switch (state[this.dpMode]) {

                case this.cmdWhite: {
                    // Обновляем яркость
                    if (changes.hasOwnProperty(this.dpBrightness)) {
                        const newBrightness = this.convertBrightnessFromTuyaToHomeKit(changes[this.dpBrightness]);
                        if (characteristicBrightness.value !== newBrightness) {
                            characteristicBrightness.updateValue(newBrightness);
                        }
                    }

                    characteristicColorTemperature.updateValue(400);

                    // Принудительно устанавливаем Hue и Saturation на 0 для белого режима
                    characteristicHue.updateValue(0);
                    characteristicSaturation.updateValue(0);
                    break;
                }

                case this.cmdColor: {
                    if (changes.hasOwnProperty(this.dpColor)) {
                        const newColor = this.convertColorFromTuyaToHomeKit(changes[this.dpColor]);
                        if (characteristicBrightness.value !== newColor.b) {
                            characteristicBrightness.updateValue(newColor.b);
                        }
                        if (characteristicHue.value !== newColor.h) {
                            characteristicHue.updateValue(newColor.h);
                        }
                        if (characteristicSaturation.value !== newColor.s) {
                            characteristicSaturation.updateValue(newColor.s);
                        }
                    }
                    break;
                }

            }
        });
    }

    getBrightness(callback) {
        if (this.device.state[this.dpMode] === this.cmdWhite) {
            this.log.debug(`device{name=${this.device.context.name}, id=${this.device.context.id}, ip=${this.device.context.ip}}; [method]getBrightness(), device.mode=${this.device.state[this.dpMode]}, return=${this.convertBrightnessFromTuyaToHomeKit(this.device.state[this.dpBrightness])}`);
            return callback(null, this.convertBrightnessFromTuyaToHomeKit(this.device.state[this.dpBrightness]))
        } else if (this.device.state[this.dpMode] === this.cmdColor) {
            this.log.debug(`device{name=${this.device.context.name}, id=${this.device.context.id}, ip=${this.device.context.ip}}; [method]getBrightness(), device.mode=${this.device.state[this.dpMode]}, return=${this.convertColorFromTuyaToHomeKit(this.device.state[this.dpColor]).b}`);
            callback(null, this.convertColorFromTuyaToHomeKit(this.device.state[this.dpColor]).b);
        }
    }

    setBrightness(value, callback) {
        if (!this.device.state[this.dpPower]) { // Устройство выключено
            this.setState(this.dpPower, true, () => { // Включаем устройство
                this._setBrightnessInternal(value, callback); // Устанавливаем яркость
            });
        } else {
            this._setBrightnessInternal(value, callback);
        }
    }

    _setBrightnessInternal(value, callback) {
        if (this.device.state[this.dpMode] === this.cmdWhite) {
            this.log.debug(`device{name=${this.device.context.name}, id=${this.device.context.id}, ip=${this.device.context.ip}}; [method]setBrightness(), device.mode=${this.device.state[this.dpMode]}, cmd=${this.cmdWhite}, value=${value}, dpBrightness=${this.dpBrightness}, return=${this.convertBrightnessFromHomeKitToTuya(value)}`);
            return this.setState(this.dpBrightness, this.convertBrightnessFromHomeKitToTuya(value), callback);
        } else if (this.device.state[this.dpMode] === this.cmdColor) {
            this.log.debug(`device{name=${this.device.context.name}, id=${this.device.context.id}, ip=${this.device.context.ip}}; [method]setBrightness(), device.mode=${this.device.state[this.dpMode]}, cmd=${this.cmdColor}, value=${value}, dpColor=${this.dpColor}, return=${this.convertColorFromHomeKitToTuya({b: value})}`);
            return this.setState(this.dpColor, this.convertColorFromHomeKitToTuya({b: value}), callback);
        }
    }

    getColorTemperature(callback) {
        return callback(null, 400);
    }

    setColorTemperature(value, callback) {
        if (value === 0) {
            return callback(null, true);
        }

        const currentBrightness = this.device.state[this.dpBrightness]
        // Фикс включения белого режима (нужно потрогать яркость)
        const newBrightness = (currentBrightness === 27)
            ? currentBrightness + 1 // Если текущая яркость минимальна, увеличиваем на 1
            : currentBrightness - 1; // В остальных случаях уменьшаем на 1

        this.log.debug(`device{name=${this.device.context.name}, id=${this.device.context.id}, ip=${this.device.context.ip}}; [method]setColorTemperature(), dpBrightness=${currentBrightness}, currentBrightness=${currentBrightness}`);

        this.setState(this.dpMode, this.cmdWhite, () => {
            setTimeout(() => {
                this.setState(this.dpBrightness, newBrightness, callback);
            }, 500); // Задержка в 500 мс
        });
    }

    getHue(callback) {
        if (this.device.state[this.dpMode] === this.cmdWhite) {
            return callback(null, 0);
        } else if (this.device.state[this.dpMode] === this.cmdColor) {
            callback(null, this.convertColorFromTuyaToHomeKit(this.device.state[this.dpColor]).h);
        }
    }

    setHue(value, callback) {
        this.log.debug(`device{name=${this.device.context.name}, id=${this.device.context.id}, ip=${this.device.context.ip}}; [method]setHue(), value=${value}`);
        this._setHueSaturation({h: value}, callback);
    }

    getSaturation(callback) {
        if (this.device.state[this.dpMode] === this.cmdWhite) {
            return callback(null, 0);
        } else if (this.device.state[this.dpMode] === this.cmdColor) {
            callback(null, this.convertColorFromTuyaToHomeKit(this.device.state[this.dpColor]).s);
        }
    }

    setSaturation(value, callback) {
        this.log.debug(`device{name=${this.device.context.name}, id=${this.device.context.id}, ip=${this.device.context.ip}}; [method]setSaturation(), value=${value}`);
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


        if (this.device.state[this.dpMode] === this.cmdWhite && isSham) {
            return callEachBack();
        }

        this.setMultiState({[this.dpMode]: this.cmdColor, [this.dpColor]: newValue}, callEachBack);
    }

}

module.exports = RGBWLightAccessory;
