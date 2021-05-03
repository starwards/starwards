import { NumericStateProperty, ShipState, shipProperties } from '@starwards/model';

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

type ShipProperties = typeof shipProperties;
type ExtractNumeric<T extends keyof ShipProperties> = ShipProperties[T] extends NumericStateProperty<'ship'>
    ? T
    : never;

class ShipMonitor {
    private monitoredAttributes = new Map<string, number>();
    readonly forceMessageInterval = 1000;
    private secondsSinceUpdate = Number.MAX_SAFE_INTEGER;

    constructor(private mqttClient: Mqtt, private shipState: ShipState) {}

    public update(deltaSeconds: number) {
        this.secondsSinceUpdate += deltaSeconds;
        this.updateAndReportAttribute('energy');
    }

    private updateAndReportAttribute<T extends keyof ShipProperties>(attrName: ExtractNumeric<T>) {
        const getter = shipProperties[attrName] as NumericStateProperty<'ship'>;
        const startingState = this.monitoredAttributes.get(attrName);
        const currentState = getter.getValue(this.shipState);
        if (currentState !== startingState || this.secondsSinceUpdate >= this.forceMessageInterval) {
            this.secondsSinceUpdate = 0;
            this.monitoredAttributes.set(attrName, currentState);
            void this.mqttClient.publish(`${getShipNamespace(this.shipState.id)}/${attrName}`, `${currentState}`);
        }
    }
}
