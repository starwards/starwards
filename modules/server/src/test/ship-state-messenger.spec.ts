import { Reactor, ShipState } from '@starwards/model';

import { ShipStateMessenger } from '../messaging/ship-state-messenger';

describe('ShipStateMessenger', () => {
    const mqttClient = {
        publish: jest.fn(),
    };
    const shipMessenger = new ShipStateMessenger(mqttClient);
    const shipState = new ShipState();
    const shipId = '1';
    beforeEach(() => {
        mqttClient.publish.mockClear();
        shipState.id = shipId;
        shipState.reactor = new Reactor();
        shipState.reactor.energy = 10;
    });

    it('publish message on ship registration', () => {
        shipMessenger.registerShip(shipState);

        expect(mqttClient.publish).toHaveBeenCalledWith(`ship/${shipId}`, `shipId ${shipId} registered`);
    });

    it('publish message on energy change', () => {
        shipMessenger.registerShip(shipState);
        shipMessenger.update(0);
        shipState.reactor.energy += 1;

        shipMessenger.update(0);

        expect(mqttClient.publish).toHaveBeenCalledWith(`ship/${shipId}/energy`, `${shipState.reactor.energy}`);
    });

    it('not publish if energy did not change', () => {
        shipMessenger.registerShip(shipState);
        shipMessenger.update(0);
        mqttClient.publish.mockClear();
        shipMessenger.update(0);
        expect(mqttClient.publish).not.toHaveBeenCalled();
    });

    it('publish if more than 1 second passed since last update even if energy did not change', () => {
        shipMessenger.registerShip(shipState);
        mqttClient.publish.mockClear();

        shipMessenger.update(1001);

        expect(mqttClient.publish).toHaveBeenCalledWith(`ship/${shipId}/energy`, `${shipState.reactor.energy}`);
    });

    it('unRegisterAll() stops updates on ship', () => {
        shipMessenger.registerShip(shipState);
        shipMessenger.unRegisterAll();
        mqttClient.publish.mockClear();
        shipMessenger.update(1001);

        expect(mqttClient.publish).not.toHaveBeenCalled();
    });
});
