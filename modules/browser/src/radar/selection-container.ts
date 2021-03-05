import { SpaceObject, SpaceState } from '@starwards/model';

import EventEmitter from 'eventemitter3';

export class SelectionContainer {
    /**
     * emits an event after an object chnanges its selection state
     * event name is the object's ID
     */
    public events = new EventEmitter();
    /**
     * currently selected objects
     */
    public selectedItems = new Set<SpaceObject>();

    public get selectedItemsIds() {
        return [...this.selectedItems].map((o) => o.id);
    }

    init(space: SpaceState) {
        space.events.on('remove', (spaceObject: SpaceObject) => {
            if (this.selectedItems.delete(spaceObject)) {
                this.events.emit(spaceObject.id);
            }
        });
        return this;
    }

    public clear() {
        const changed = [...this.selectedItems];
        this.selectedItems.clear();
        for (const spaceObject of changed) {
            this.events.emit(spaceObject.id);
        }
        this.events.emit('changed');
    }

    public set(selected: SpaceObject[]) {
        const changed = selected.filter((so) => !this.selectedItems.delete(so)).concat(...this.selectedItems);
        this.selectedItems.clear();
        for (const spaceObject of selected) {
            this.selectedItems.add(spaceObject);
        }
        for (const spaceObject of changed) {
            this.events.emit(spaceObject.id);
        }
        this.events.emit('changed');
    }

    public has(o: SpaceObject) {
        return this.selectedItems.has(o);
    }

    public getSingle() {
        return this.selectedItems.values().next().value as SpaceObject | undefined;
    }
}
