import { MqttClient, connect, Packet } from 'mqtt';
import { Logger } from 'homebridge';

export class MqttLib {
  private client: MqttClient;
  private readonly callbacks: Map<string, ((topic: string, message: string) => Promise<void>)[]> = new Map();
  constructor(private readonly log: Logger, host: string, username: string, password: string) {
    this.client = connect(host, {
      'username': username,
      'password': password,
    });
    this.client.on('message', this.handleMessage.bind(this));
    this.client.on('connect', () => this.log.info('Connected to MQTT'));
    this.client.on('error', (error) => this.log.error('MQTT Error:' + error.message));
  }

  async send(topic: string, message: string): Promise<Packet | undefined> {
    this.log.debug('Sending message: ' + topic.toString(), message.toString());
    return this.client.publishAsync(topic, message);
  }

  private async handleMessage(topic: string, message: Buffer) {
    this.log.debug('Received message: ' + topic.toString(), message.toString());
    this.callbacks.get(topic)?.forEach(cb => cb(topic, message.toString()));
  }

  async subscribe(topic: string, cb: (topic: string, message: string) => Promise<void>): Promise<void> {
    this.log.info('Subscribing to topic: ' + topic);
    if (!this.callbacks.has(topic)) {
      this.callbacks.set(topic, [cb]);
    } else {
      this.callbacks.get(topic)?.push(cb);
    }
    this.client.subscribe(topic);
  }
}