import { Faction, ShipModel } from '@starwards/core';

import EventEmitter from 'eventemitter3';

export type TemplateRange = { min: number; max: number };
export type CreateAsteroidTemplate = {
    type: 'Asteroid';
    radius: TemplateRange;
};
export type CreateSpaceshipTemplate = {
    type: 'Spaceship';
    shipModel: ShipModel;
    faction: Faction;
};
export type CreateTemplate = CreateAsteroidTemplate | CreateSpaceshipTemplate;
export type EventTypes = {
    cancel: [];
    createByTemplate: [CreateTemplate];
};
export class CreateObjectsContainer {
    private _events = new EventEmitter<EventTypes>();
    public readonly events: Pick<EventEmitter<EventTypes>, 'on' | 'once' | 'off' | 'removeListener'> = this._events;

    createAsteroid(t: CreateAsteroidTemplate) {
        this._events.emit('createByTemplate', t);
    }

    createSpaceship(t: CreateSpaceshipTemplate) {
        this._events.emit('createByTemplate', t);
    }

    cancel() {
        this._events.emit('cancel');
    }
}
