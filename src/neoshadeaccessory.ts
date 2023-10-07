

import { PlatformAccessory, Service, CharacteristicValue, Characteristic } from 'homebridge';
import { NeoShadePlatform } from './neoshadeplatform';

import * as net from 'net';
import Queue, { QueueWorkerCallback } from 'queue';
export class NEOShadeAccessory {
  private service: Service;

  private sendQueue: Queue = Queue({autostart:true, concurrency:1});

  constructor(
        private readonly platform: NeoShadePlatform,
        private readonly accessory: PlatformAccessory,
  ) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'NEO Smart')
          .setCharacteristic(this.platform.Characteristic.Model, 'Roller Shade')
          .setCharacteristic(this.platform.Characteristic.Name, this.accessory.context.config.name )
          .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.config.code );
        this.accessory.getService(this.platform.Service.WindowCovering) || this.accessory.addService(this.platform.Service.WindowCovering);
        this.service = this.accessory.getService(this.platform.Service.WindowCovering)
            || this.accessory.addService(this.platform.Service.WindowCovering);

        this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
        this.service.setCharacteristic(this.platform.Characteristic.CurrentPosition, 50);
        this.service.setCharacteristic(this.platform.Characteristic.TargetPosition, 50);
        this.service.getCharacteristic(this.platform.Characteristic.TargetPosition).onSet(this.setTargetPosition.bind(this))

        if(this.accessory.context.config.positionSensorType === 'mqtt') {
          this.platform.mqttLib?.subscribe(this.accessory.context.config.positionSensorTopic, this.handleUpdate.bind(this));
        }
  }

  async handleUpdate(topic: string, message: string): Promise<void> {
    this.platform.log.debug('Received message:\n  topic: ' + topic + '\n  message: ' + message);
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, parseInt(message));
    this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, parseInt(message));
  }

  async send(command: string) {
    this.sendQueue.push(((cb?: QueueWorkerCallback) => {
      const telnetClient = net.createConnection(8839, this.platform.config.host, ()=> {
        telnetClient.write(command +'\r', ()=> {
          const now = new Date();
          this.platform.log.debug(`Sent Command: ${command} at time: ${now.toLocaleTimeString()}`);
          setTimeout( ()=> {
            this.updatePosition();
            if (cb) {
              cb();
            }
          }, 500);
        });
      });
    }).bind(this));
  }

  async updatePosition() {
    this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);
    if (this.accessory.context.config.positionSensorType === 'mqtt') {
      this.platform.mqttLib?.send(this.accessory.context.config.positionSensorTopic + '/get', '');
    } else {
      // NEO controller doesn't detect actual position,
      //    reset shade after 20 seconds to show the user the shade is at half-position - i.e., neither up or down!
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 50);
      this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, 50);
    }
  }



  async setTargetPosition(value: CharacteristicValue): Promise<void> {
    this.platform.log.debug("New target position: " + (value as number))
    const target = value as number;
    switch(target) {
      case 0: // Close the Shade!
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.DECREASING);
        this.send(
          this.accessory.context.config.code + '-dn!' +
            (this.accessory.context.config.motorType ? this.accessory.context.config.motorType : 'bf'),
        );
        setTimeout( this.updatePosition.bind(this), 25000);
        break;
      case 24:
      case 25:
      case 26: // Move Shade to Favorite position!
        if (this.service.getCharacteristic(this.platform.Characteristic.CurrentPosition).value as number > 25) {
            this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.DECREASING);
        } else {
            this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.INCREASING);
        }
        this.send(
          this.accessory.context.config.code + '-gp' +
            (this.accessory.context.config.motorType ? this.accessory.context.config.motorType : 'bf'),
        );
        setTimeout( this.updatePosition.bind(this), 25000);
        break;

      case 100: // Open the shade
        this.service.updateCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.INCREASING);
        this.send(
          this.accessory.context.config.code + '-up!' +
            (this.accessory.context.config.motorType ? this.accessory.context.config.motorType : 'bf'),
        );

        setTimeout( this.updatePosition.bind(this), 25000);
        break;
      default:
        // Do nothing if any ohter value is selected!
        this.platform.log.debug(
          '*Debug* - You must slide window covering all the way up or down or to 25% (favorite position) for anything to happen!',
        );
        break;
    }

  }
}
