import mqtt, { AsyncMqttClient } from 'async-mqtt';

export class MqttClient {
    private client: AsyncMqttClient;
    constructor(serverUrl: string, serverPort: number) {
        this.client = mqtt.connect(`${serverUrl}:${serverPort}`);
    }

    public async publish(topic: string, message: string) {
        try {
            await this.client.publish(topic, message);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log(e);
        }
    }
}
