import { Faction, ShipModel } from '@starwards/core';

import EventEmitter from 'eventemitter3';

export type TemplateRange = { min: number; max: number };
export type CreateAsteroidTemplate = {
    type: 'Asteroid';
    radius: TemplateRange;
};
export type CreateSpaceshipTemplate = {
    type: 'Spaceship';
    isPlayerShip: boolean;
    shipModel: ShipModel;
    faction: Faction;
};
export type CreateExplosionTemplate = {
    type: 'Explosion';
    damageFactor: TemplateRange;
};
export type CreateWaypointTemplate = {
    type: 'Waypoint';
};

export type CreateTemplate =
    | CreateAsteroidTemplate
    | CreateSpaceshipTemplate
    | CreateExplosionTemplate
    | CreateWaypointTemplate;
export type EventTypes = {
    cancel: [];
    createByTemplate: [CreateTemplate];
};
export class InteractiveLayerCommands {
    private _events = new EventEmitter<EventTypes>();
    public readonly events: Pick<EventEmitter<EventTypes>, 'on' | 'once' | 'off' | 'removeListener'> = this._events;

    createByTemplate(t: CreateTemplate) {
        this._events.emit('createByTemplate', t);
    }

    cancel() {
        this._events.emit('cancel');
    }
}
