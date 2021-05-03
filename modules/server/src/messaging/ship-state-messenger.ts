import { NumericStateProperty, ShipState, shipProperties } from '@starwards/model';

import { MqttClient } from './mqtt-client';

function getShipNamespace(shipId: string) {
    return `ship/${shipId}`;
}
export class ShipStateMessenger {
    private shipStates = new Map<string, ShipMonitor>();

    constructor(private mqttClient: MqttClient, public updateInterval = 1) {}

    public registerShip(state: ShipState) {
        this.shipStates.set(state.id, new ShipMonitor(this.mqttClient, state));
        void this.mqttClient.publish(getShipNamespace(state.id), `shipId ${state.id} registered`);
    }

    public deRegisterShip(id: string) {
        if (!this.shipStates.has(id)) {
            throw new Error(`ship ${id} not registered`);
        }
        this.shipStates.delete(id);
        void this.mqttClient.publish(getShipNamespace(id), `shipId ${id} unregistered`);
    }

    public update(_: number) {
        for (const shipMonitor of this.shipStates.values()) {
            shipMonitor.update();
        }
    }
}

type ShipProperties = typeof shipProperties;
type ExtractNumeric<T extends keyof ShipProperties> = ShipProperties[T] extends NumericStateProperty<'ship'>
    ? T
    : never;

class ShipMonitor {
    private monitoredAttributes = new Map<string, number>();
    private lastUpdate = Date.now();
    readonly forceMessageInterval = 1000;

    constructor(private mqttClient: MqttClient, private shipState: ShipState) {
        this.update();
    }

    public update() {
        this.updateAndReportAttribute('energy');
    }

    private updateAndReportAttribute<T extends keyof ShipProperties>(attrName: ExtractNumeric<T>) {
        const getter = shipProperties[attrName] as NumericStateProperty<'ship'>;
        const startingState = this.monitoredAttributes.get(attrName);
        const currentState = getter.getValue(this.shipState);
        const now = Date.now();
        if (currentState !== startingState || now - this.lastUpdate >= this.forceMessageInterval) {
            this.monitoredAttributes.set(attrName, currentState);
            void this.mqttClient.publish(`${getShipNamespace(this.shipState.id)}/${attrName}`, `${currentState}`);
            this.lastUpdate = now;
        }
    }
}
