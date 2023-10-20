import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { NEOShadeAccessory, ShadeConfig } from './neoshadeaccessory';
import { MqttLib } from './lib/mqtt';

export class NeoShadePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  public mqttLib: MqttLib | null;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    if (this.config.shades?.some((element: ShadeConfig) => element.positionSensorType === 'mqtt') === true && this.config.mqttUrl) {
      this.log.debug('Connecting to mqtt');
      this.mqttLib = new MqttLib(
        log,
        this.config.mqttUrl,
        this.config.mqttUsername,
        this.config.mqttPassword,
      );
    } else {
      this.log.info('Not connecting to mqtt');
      this.mqttLib = null;
    }

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only  new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }


  /**
       * This function is invoked when homebridge restores cached accessories from disk at startup.
       * It should be used to setup event handlers for characteristics and update respective values.
       */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverDevices() {

    this.log.debug('Configuring NEOSmartPlatform:');

    this.config?.shades?.forEach(((currentShade: ShadeConfig) => {

      const uuid: string = this.api.hap.uuid.generate(currentShade.code);
      this.log.debug('Setting up shade ' + uuid + ' with config.json data set to:' + JSON.stringify(currentShade));
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      try {
        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          existingAccessory.context.config = currentShade;
          new NEOShadeAccessory(this, existingAccessory);
        } else {
          this.log.info('Adding new accessory:', currentShade.name);
          const accessory = new this.api.platformAccessory(currentShade.name, uuid);
          accessory.context.config = currentShade;
          new NEOShadeAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      } catch (error) {
        this.log.error('** Error ** creating new NEO Smart Shade in file index.js.');
        throw error;
      }

    }).bind(this));
  }
}