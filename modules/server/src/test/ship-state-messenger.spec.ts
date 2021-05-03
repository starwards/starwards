import MockDate from 'mockdate';
import { MqttClient } from '../messaging/mqtt-client';
import { ShipState } from '@starwards/model';
import { ShipStateMessenger } from '../messaging/ship-state-messenger';
jest.mock('../messaging/mqtt-client');

const mockMqttClient = MqttClient as jest.MockedClass<typeof MqttClient>;

describe('ShipStateMessenger', () => {
    const mqttClient = new MqttClient('someUrl', 1234);
    const shipMessenger = new ShipStateMessenger(mqttClient);
    const shipState = new ShipState();
    const shipId = '1';
    const startDate = Date.now();

    beforeEach(() => {
        mockMqttClient.prototype.publish.mockClear();
        shipState.id = shipId;
        shipState.energy = 10;
        MockDate.set(startDate);
    });

    afterAll(() => {
        MockDate.reset();
    });

    it('publish message on ship registration', () => {
        shipMessenger.registerShip(shipState);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockMqttClient.prototype.publish).toHaveBeenCalledWith(`ship/${shipId}`, `shipId ${shipId} registered`);
    });

    it('publish message on energy change', () => {
        shipMessenger.registerShip(shipState);
        shipState.energy += 1;

        shipMessenger.update(0);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockMqttClient.prototype.publish).toHaveBeenCalledWith(`ship/${shipId}/energy`, `${shipState.energy}`);
    });

    it('not publish if energy did not change', () => {
        shipMessenger.registerShip(shipState);
        mockMqttClient.prototype.publish.mockClear();
        shipMessenger.update(0);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockMqttClient.prototype.publish).not.toHaveBeenCalled();
    });

    it('publish if more than 1 second passed since last update even if energy did not change', () => {
        shipMessenger.registerShip(shipState);
        mockMqttClient.prototype.publish.mockClear();
        MockDate.set(startDate + 1001);

        shipMessenger.update(0);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockMqttClient.prototype.publish).toHaveBeenCalledWith(`ship/${shipId}/energy`, `${shipState.energy}`);
    });
});
