

import { PlatformAccessory, Service, CharacteristicValue  } from 'homebridge';
import { MqttLib, NeoShadePlatform } from "./neoshadeplatform";

import * as net from "net";
import Queue from "queue";
export class NEOShadeAccessory {
    private service: Service;

    private sendQueue: Queue = Queue({autostart:true, concurrency:1})

    constructor(
        private readonly platform: NeoShadePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, "NEO Smart")
            .setCharacteristic(this.platform.Characteristic.Model, "Roller Shade")
            .setCharacteristic(this.platform.Characteristic.Name, this.accessory.context.config.name )
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.config.code )
        this.accessory.getService(this.platform.Service.WindowCovering) || this.accessory.addService(this.platform.Service.WindowCovering);
        this.service = this.accessory.getService(this.platform.Service.WindowCovering) || this.accessory.addService(this.platform.Service.WindowCovering);

        this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 50)
        this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, 50)
        
        if(this.accessory.context.config.position_sensor_type === "mqtt") {
            this.platform.mqttLib?.subscribe(this.accessory.context.config.positionSensorTopic, this.handleUpdate.bind(this))
        }
    }

    async handleUpdate(topic: string, message: string): Promise<void> {
        console.log("Received message:\n  topic: " + topic + "\n  message: " + message);
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, parseFloat(message))
        this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, parseFloat(message))
    }
    
    async send(command: string) {
        let that = this
        function sendfunction(cb) {
            var telnetClient = net.createConnection(8839, that.platform.config.host, ()=>  {
                telnetClient.write(command +"\r", ()=>  {
                    var now = new Date();
                    console.log(`Sent Command: ${command} at time: ${now.toLocaleTimeString()}`) 
                    setTimeout( ()=> {
                        that.updatePosition()
                        cb()
                    }, 500);
                });
            });
        }
        this.sendQueue.push(sendfunction)
    }

    async updatePosition() {
        if (this.accessory.context.config.positionSensorType === "mqtt") {
            this.platform.mqttLib?.send(this.accessory.context.config.positionSensorTopic + "/get", "");
        } else {
            // NEO controller doesn't detect actual position, reset shade after 20 seconds to show the user the shade is at half-position - i.e., neither up or down!
            this.service.updateCharacteristic(this.platform.Characteristic.CurrentPosition, 50)
            this.service.updateCharacteristic(this.platform.Characteristic.TargetPosition, 50)
        }
    }

    

    async setTargetPosition(value: CharacteristicValue) {
        let target = value as number;
        switch(target) {
            case 0: // Close the Shade!
                this.send(this.accessory.context.config.code + "-dn!" + (this.accessory.context.config.motorType ? this.accessory.context.config.motorType : "bf") )
                setTimeout( this.updatePosition.bind(this), 25000);
                break;
            case 24:
            case 25:
            case 26: // Move Shade to Favorite position!
                this.send(this.accessory.context.config.code + "-gp" + (this.accessory.context.config.motorType ? this.accessory.context.config.motorType : "bf"))
                setTimeout( this.updatePosition.bind(this), 25000);
                break					
                
            case 100: // Open the shade
                this.send(this.accessory.context.config.code + "-up!" + (this.accessory.context.config.motorType ? this.accessory.context.config.motorType : "bf"))

                setTimeout( this.updatePosition.bind(this), 25000);
                break;
            default:
                // Do nothing if any ohter value is selected!
                console.log("*Debug* - You must slide window covering all the way up or down or to 25% (favorite position) for anything to happen!");
                break;
        }
    
    }
}
