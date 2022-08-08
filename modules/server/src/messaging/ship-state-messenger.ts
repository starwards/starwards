import { ShipState, getJsonPointer } from '@starwards/core';

function getShipNamespace(shipId: string) {
    return `ship/${shipId}`;
}
type Mqtt = {
    publish(topic: string, message: string): unknown;
};
export class ShipStateMessenger {
    private shipStates = new Map<string, ShipMonitor>();

    constructor(private mqttClient: Mqtt, public updateInterval = 1) {}

    public registerShip(state: ShipState) {
        this.shipStates.set(state.id, new ShipMonitor(this.mqttClient, state));
        void this.mqttClient.publish(getShipNamespace(state.id), `shipId ${state.id} registered`);
    }

    public unRegisterShip(id: string) {
        if (!this.shipStates.has(id)) {
            throw new Error(`ship ${id} not registered`);
        }
        this.shipStates.delete(id);
        void this.mqttClient.publish(getShipNamespace(id), `shipId ${id} unregistered`);
    }

    public unRegisterAll() {
        for (const shipId of this.shipStates.keys()) {
            this.unRegisterShip(shipId);
        }
    }

    public update(deltaSeconds: number) {
        for (const shipMonitor of this.shipStates.values()) {
            shipMonitor.update(deltaSeconds);
        }
    }
}

class ShipMonitor {
    private monitoredAttributes = new Map<string, string>();
    readonly forceMessageInterval = 1000;
    private secondsSinceUpdate = Number.MAX_SAFE_INTEGER;

    constructor(private mqttClient: Mqtt, private shipState: ShipState) {}

    public update(deltaSeconds: number) {
        this.secondsSinceUpdate += deltaSeconds;
        this.updateAndReportAttribute('/reactor/energy');
    }

    private updateAndReportAttribute(pointerStr: string) {
        const pointer = getJsonPointer(pointerStr);
        if (pointer) {
            const startingState = this.monitoredAttributes.get(pointerStr);
            const currentState = String(pointer.get(this.shipState));
            if (currentState !== startingState || this.secondsSinceUpdate >= this.forceMessageInterval) {
                this.secondsSinceUpdate = 0;
                this.monitoredAttributes.set(pointerStr, currentState);
                void this.mqttClient.publish(`${getShipNamespace(this.shipState.id)}${pointerStr}`, `${currentState}`);
            }
        }
    }
}
