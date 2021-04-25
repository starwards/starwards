import { NumericStateProperty, ShipState } from '@starwards/model/src';

import { MapSchema } from '@colyseus/schema';
import { MqttClient } from './mqtt-client';
import { energy } from '../../../model/src/ship/ship-properties';

export enum ReportableAttributes {
    Energy = 'ENERGY',
}

export class ShipStateMessenger {
    public updateInterval: number;
    private mqttClient: MqttClient;
    private shipStates = new Map<string, ShipMonitor>();
    private publishTopic: string;

    constructor(mqttClient: MqttClient, publishTopic: string, updateInterval = 1) {
        this.mqttClient = mqttClient;
        this.publishTopic = publishTopic;
        this.updateInterval = updateInterval;
    }

    public async registerShip(
        id: string,
        state: ShipState,
        updateInterval = this.updateInterval,
        monitoredAttributes = [ReportableAttributes.Energy]
    ) {
        this.shipStates.set(
            id,
            new ShipMonitor(this.mqttClient, this.publishTopic, state, monitoredAttributes, updateInterval)
        );
        await this.mqttClient.publish(`shipId ${id} registered`, this.publishTopic);
    }

    public async deRegisterShip(id: string) {
        if (!this.shipStates.has(id)) {
            throw new Error(`ship ${id} not registered`);
        }
        this.shipStates.delete(id);
        await this.mqttClient.publish(`shipId ${id} unregistered`, this.publishTopic);
    }

    public update(_: number) {
        this.shipStates.forEach((shipMonitor) => shipMonitor.update());
    }
}

function makeAttributeToPropertyMapper() {
    const mapper = new MapSchema<NumericStateProperty<'ship'>>();
    mapper.set(ReportableAttributes.Energy, energy);
    return mapper;
}

class ShipMonitor {
    public topic: string;
    public updateInterval: number;
    private shipState: ShipState;
    private monitoredAttributes = new MapSchema<number>();
    private mqttClient: MqttClient;
    private attributeToPropertyMapper = makeAttributeToPropertyMapper();

    constructor(
        mqttClient: MqttClient,
        topic: string,
        shipState: ShipState,
        monitoredAttributes: ReportableAttributes[],
        updateInterval = 1
    ) {
        this.shipState = shipState;
        this.updateInterval = updateInterval;
        this.mqttClient = mqttClient;
        this.topic = topic;
        monitoredAttributes.forEach((attr) => this.addMonitoredAttribute(attr));
    }

    public addMonitoredAttribute(attribute: ReportableAttributes) {
        if (!this.attributeToPropertyMapper.has(attribute)) {
            throw new Error(`no attribute getter for ${attribute}`);
        }
        this.monitoredAttributes.set(attribute, this.getAttributeValue(attribute));
    }

    public removeMonitoredAttribute(attribute: ReportableAttributes) {
        this.monitoredAttributes.delete(attribute);
    }

    public update() {
        this.monitoredAttributes.forEach((_, attribute) => {
            try {
                this.updateAndReportAttribute(attribute);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.log(e);
            }
        });
    }

    private getAttributeValue(attribute: string): number {
        const maybeAttrGetter = this.attributeToPropertyMapper.get(attribute);
        if (maybeAttrGetter === undefined) {
            throw new Error(`no attribute getter for ${attribute}`);
        }
        return maybeAttrGetter.getValue(this.shipState);
    }

    private updateAndReportAttribute(attribute: string) {
        const maybeAttrGetter = this.attributeToPropertyMapper.get(attribute);
        if (maybeAttrGetter === undefined) {
            throw new Error(`no attribute getter for ${attribute}`);
        }
        const startingState = this.monitoredAttributes.get(attribute);
        if (startingState === undefined) {
            throw Error(`Unexpected undefined state for ${attribute}`);
        }
        const currentState = this.getAttributeValue(attribute);
        this.monitoredAttributes.set(attribute, currentState);
        if (currentState !== startingState) {
            void this.mqttClient.publish(
                `${this.shipState.id} ${attribute} changed: ${startingState} -> ${currentState}`,
                this.topic
            );
        }
    }
}
