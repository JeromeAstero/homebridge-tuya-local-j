const TuyaAccessory = require('./lib/TuyaAccessory');
const TuyaDiscovery = require('./lib/TuyaDiscovery');

const RGBWLightAccessory = require('./lib/RGBWLightAccessory');

const PLUGIN_NAME = 'homebridge-tuya-rgbw';
const PLATFORM_NAME = 'TuyaLan-rgbw';

const CLASS_DEF = {
    rgbwlight: RGBWLightAccessory
};

let Characteristic, PlatformAccessory, Service, Categories, UUID;

module.exports = function(homebridge) {
    ({
        platformAccessory: PlatformAccessory,
        hap: {Characteristic, Service, Accessory: {Categories}, uuid: UUID}
    } = homebridge);

    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, TuyaLan, true);
};

class TuyaLan {
    constructor(...props) {
        [this.log, this.config, this.api] = [...props];

        this.cachedAccessories = new Map();

        if(!this.config || !this.config.devices) {
            this.log("No devices found. Check that you have specified them in your config.json file.");
            return false;
        }

        this._expectedUUIDs = this.config.devices.map(device => UUID.generate(PLUGIN_NAME +(device.fake ? ':fake:' : ':') + device.id));

        this.api.on('didFinishLaunching', () => {
            this.discoverDevices();
        });
    }

    discoverDevices() {
        const devices = {};
        const connectedDevices = [];
        this.config.devices.forEach(device => {
            try {
                device.id = ('' + device.id).trim();
                device.key = ('' + device.key).trim();
                device.type = ('' + device.type).trim();
                device.ip = ('' + (device.ip || '')).trim();
            } catch(ex) {}

            if (!device.type) return this.log.error('%s (%s) doesn\'t have a type defined.', device.name || 'Unnamed device', device.id);
            if (!CLASS_DEF[device.type.toLowerCase()]) return this.log.error('%s (%s) doesn\'t have a valid type defined.', device.name || 'Unnamed device', device.id);

            else devices[device.id] = {name: device.id.slice(8), ...device};
        });

        const deviceIds = Object.keys(devices);
        if (deviceIds.length === 0) return this.log.error('No valid configured devices found.');

        this.log.info('Starting discovery...');

        TuyaDiscovery.start({ids: deviceIds, log: this.log})
            .on('discover', config => {
                if (!config || !config.id) return;
                if (!devices[config.id]) return;

                connectedDevices.push(config.id);

                this.log.info('Discovered %s (%s) identified as %s (%s)', devices[config.id].name, config.id, devices[config.id].type, config.version);

                const device = new TuyaAccessory({
                    ...devices[config.id], ...config,
                    log: this.log,
                    UUID: UUID.generate(PLUGIN_NAME + ':' + config.id),
                    connect: false
                });
                this.addAccessory(device);
            });

        setTimeout(() => {
            deviceIds.forEach(deviceId => {
                if (connectedDevices.includes(deviceId)) return;

                if (devices[deviceId].ip) {

                    this.log.info('Failed to discover %s (%s) in time but will connect via %s.', devices[deviceId].name, deviceId, devices[deviceId].ip);

                    const device = new TuyaAccessory({
                        ...devices[deviceId],
                        log: this.log,
                        UUID: UUID.generate(PLUGIN_NAME + ':' + deviceId),
                        connect: false
                    });
                    this.addAccessory(device);
                } else {
                    this.log.warn('Failed to discover %s (%s) in time but will keep looking.', devices[deviceId].name, deviceId);
                }
            });
        }, 60000);
    }

    registerPlatformAccessories(platformAccessories) {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, Array.isArray(platformAccessories) ? platformAccessories : [platformAccessories]);
    }

    configureAccessory(accessory) {
        // also checks null objects or empty config - this._expectedUUIDs
        if (accessory instanceof PlatformAccessory && this._expectedUUIDs && this._expectedUUIDs.includes(accessory.UUID)) {
            this.cachedAccessories.set(accessory.UUID, accessory);
            accessory.services.forEach(service => {
                if (service.UUID === Service.AccessoryInformation.UUID) return;
                service.characteristics.some(characteristic => {
                    if (!characteristic.props ||
                        !Array.isArray(characteristic.props.perms) ||
                        characteristic.props.perms.length !== 3 ||
                        !(characteristic.props.perms.includes(Characteristic.Perms.WRITE) && characteristic.props.perms.includes(Characteristic.Perms.NOTIFY))
                    ) return;

                    this.log.info('Marked %s unreachable by faulting Service.%s.%s', accessory.displayName, service.displayName, characteristic.displayName);

                    characteristic.updateValue(new Error('Unreachable'));
                    return true;
                });
            });
        } else {
            /*
             * Irrespective of this unregistering, Homebridge continues
             * to "_prepareAssociatedHAPAccessory" and "addBridgedAccessory".
             * This timeout will hopefully remove the accessory after that has happened.
             */
            setTimeout(() => {
                this.removeAccessory(accessory);
            }, 1000);
        }
    }

    addAccessory(device) {
        const deviceConfig = device.context;
        const type = (deviceConfig.type || '').toLowerCase();

        const Accessory = CLASS_DEF[type];

        let accessory = this.cachedAccessories.get(deviceConfig.UUID),
            isCached = true;

        if (accessory && accessory.category !== Accessory.getCategory(Categories)) {
            this.log.info("%s has a different type (%s vs %s)", accessory.displayName, accessory.category, Accessory.getCategory(Categories));
            this.removeAccessory(accessory);
            accessory = null;
        }

        if (!accessory) {
            accessory = new PlatformAccessory(deviceConfig.name, deviceConfig.UUID, Accessory.getCategory(Categories));
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Manufacturer, deviceConfig.manufacturer || "Unknown")
                .setCharacteristic(Characteristic.Model, deviceConfig.model || "Unknown")
                .setCharacteristic(Characteristic.SerialNumber, deviceConfig.id.slice(8));

            isCached = false;
        }

        if (accessory && accessory.displayName !== deviceConfig.name) {
            this.log.info(
                "Configuration name %s differs from cached displayName %s. Updating cached displayName to %s ",
                deviceConfig.name, accessory.displayName, deviceConfig.name);
            accessory.displayName = deviceConfig.name;
        }

        this.cachedAccessories.set(deviceConfig.UUID, new Accessory(this, accessory, device, !isCached));
    }

    removeAccessory(homebridgeAccessory) {
        if (!homebridgeAccessory) return;

        this.log.warn('Unregistering', homebridgeAccessory.displayName);

        delete this.cachedAccessories[homebridgeAccessory.UUID];
        this.api.unregisterPlatformAccessories(PLATFORM_NAME, PLATFORM_NAME, [homebridgeAccessory]);
    }

    removeAccessoryByUUID(uuid) {
        if (uuid) this.removeAccessory(this.cachedAccessories.get(uuid));
    }
}
