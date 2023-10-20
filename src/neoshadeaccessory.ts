

import { PlatformAccessory, Service, CharacteristicValue, Characteristic, Nullable } from 'homebridge';
import { NeoShadePlatform } from './neoshadeplatform';

import * as net from 'net';
import Queue, { QueueWorkerCallback } from 'queue';

export interface ShadeConfig {
  name: string;
  code: string;
  motorType: string;
  positionSensorType: string;
  positionSensorTopics?: Array<string>;
}

export class NEOShadeAccessory {
  private service: Service;

  private readonly config: ShadeConfig = this.accessory.context.config;

  private readonly sendQueue: Queue = Queue({ autostart: true, concurrency: 1 });
  private readonly Characteristic: typeof Characteristic = this.platform.Characteristic;
  private readonly Service: typeof Service = this.platform.Service;
  private readonly Topics: Array<string> = this.config.positionSensorTopics ?? [];

  constructor(
    private readonly platform: NeoShadePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, 'NEO Smart')
      .setCharacteristic(this.Characteristic.Model, 'Roller Shade')
      .setCharacteristic(this.Characteristic.Name, this.config.name)
      .setCharacteristic(this.Characteristic.SerialNumber, this.config.code);

    this.service = this.accessory.getService(this.Service.WindowCovering) || this.accessory.addService(this.Service.WindowCovering);

    this.setPositionState(this.Characteristic.PositionState.STOPPED);
    this.setPosition(50);
    this.setTargetPosition(50);
    this.service.getCharacteristic(this.Characteristic.TargetPosition).onSet(this.updateTargetPosition.bind(this));

    if (this.config.positionSensorType === 'mqtt') {
      this.Topics.forEach((topic: string) => {
        this.platform.mqttLib?.subscribe(topic, this.handleUpdate.bind(this));
      });
    }
  }

  setPositionState(positionState: CharacteristicValue): void {
    this.service.updateCharacteristic(this.Characteristic.PositionState, positionState);
  }

  getPositionState(): Nullable<CharacteristicValue> {
    return this.service.getCharacteristic(this.Characteristic.PositionState).value;
  }

  setTargetPosition(position: number): void {
    this.service.updateCharacteristic(this.Characteristic.TargetPosition, position);
  }

  getTargetPosition(): Nullable<CharacteristicValue> {
    return this.service.getCharacteristic(this.Characteristic.TargetPosition).value;
  }

  setPosition(position: number): void {
    this.service.updateCharacteristic(this.Characteristic.CurrentPosition, position);
  }

  getPosition(): Nullable<CharacteristicValue> {
    return this.service.getCharacteristic(this.Characteristic.CurrentPosition).value;
  }

  async handleUpdate(topic: string, message: string): Promise<void> {
    this.platform.log.debug('Received message:\n  topic: ' + topic + '\n  message: ' + message);

    const contact: boolean = JSON.parse(message).contact;

    const multiplier: number = 100.0 / (this.Topics.length - 1);
    const contact_position = this.Topics.indexOf(topic) * multiplier;

    if (contact) {
      this.setPosition(contact_position);
    } else if ( this.getPosition() === contact_position) {
      const direction = this.getPositionState();
      if (direction === this.Characteristic.PositionState.INCREASING) {
        this.setPosition((this.Topics.indexOf(topic) + 0.5) * multiplier);
      } else if (direction === this.Characteristic.PositionState.DECREASING) {
        this.setPosition((this.Topics.indexOf(topic) - 0.5) * multiplier);
      }
    }
  }

  async send(command: string) {
    this.sendQueue.push(((cb?: QueueWorkerCallback) => {
      const telnetClient = net.createConnection(8839, this.platform.config.host, () => {
        telnetClient.write(command + '\r', () => {
          const now = new Date();
          this.platform.log.debug(`Sent Command: ${command} at time: ${now.toLocaleTimeString()}`);
          setTimeout(() => {
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
    this.setPositionState(this.Characteristic.PositionState.STOPPED);
    if (this.config.positionSensorType === 'mqtt') {
      this.Topics.forEach((topic: string) => {
        this.platform.mqttLib?.send(topic + '/get', '');
      });
    } else {
      // NEO controller doesn't natively detect actual position,
      //    reset shade after 20 seconds to show the user the shade is at half-position - i.e., neither up or down!
      this.setPosition(50);
      this.setTargetPosition(50);
    }
  }



  async updateTargetPosition(value: CharacteristicValue): Promise<void> {
    this.platform.log.debug('New target position: ' + (value as number));
    const target = value as number;
    switch (target) {
      case 0: // Close the Shade!
        this.setPositionState(this.Characteristic.PositionState.DECREASING);
        this.send(
          this.config.code + '-dn!' +
          (this.config.motorType ? this.config.motorType : 'bf'),
        );
        setTimeout(this.updatePosition.bind(this), 25000);
        break;
      case 24:
      case 25:
      case 26: // Move Shade to Favorite position!
        if (this.getPosition() as number > 25) {
          this.setPositionState(this.Characteristic.PositionState.DECREASING);
        } else {
          this.setPositionState(this.Characteristic.PositionState.INCREASING);
        }
        this.send(
          this.config.code + '-gp' +
          (this.config.motorType ? this.config.motorType : 'bf'),
        );
        setTimeout(this.updatePosition.bind(this), 25000);
        break;

      case 100: // Open the shade
        this.setPositionState(this.Characteristic.PositionState.INCREASING);
        this.send(
          this.config.code + '-up!' +
          (this.config.motorType ? this.config.motorType : 'bf'),
        );

        setTimeout(this.updatePosition.bind(this), 25000);
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
