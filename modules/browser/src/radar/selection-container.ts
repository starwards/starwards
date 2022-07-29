import { SpaceDriver, SpaceObject } from '@starwards/model';

import EventEmitter from 'eventemitter3';
import { Remove } from 'colyseus-events';

export class SelectionContainer {
    /**
     * emits an event after an object chnanges its selection state
     * event name is the object's ID
     */
    public events = new EventEmitter();
    /**
     * currently selected objects
     */
    private selected = new Map<string, SpaceObject>();
    public get selectedItems(): Iterable<SpaceObject> {
        return this.selected.values();
    }

    public get selectedItemsIds() {
        return [...this.selectedItems].map((o) => o.id);
    }

    init(spaceDriver: SpaceDriver) {
        spaceDriver.events.on('/$remove', (event: Remove) => {
            const id = event.path.split('/')[1];
            if (this.selected.delete(id)) {
                this.events.emit(id);
                this.events.emit('changed');
            }
        });
        return this;
    }

    public clear() {
        const changed = [...this.selected.keys()];
        this.selected.clear();
        if (changed.length) {
            for (const id of changed) {
                this.events.emit(id);
            }
            this.events.emit('changed');
        }
    }

    public set(selected: SpaceObject[]) {
        const changed = selected.filter((so) => !this.selected.delete(so.id)).concat(...this.selected.values());
        this.selected.clear();
        for (const spaceObject of selected) {
            this.selected.set(spaceObject.id, spaceObject);
        }
        if (changed.length) {
            for (const spaceObject of changed) {
                this.events.emit(spaceObject.id);
            }
            this.events.emit('changed');
        }
    }

    public has(o: SpaceObject) {
        return this.selected.has(o.id);
    }
    get size() {
        return this.selected.size;
    }

    public getSingle() {
        return this.selectedItems[Symbol.iterator]().next().value as SpaceObject | undefined;
    }
}
