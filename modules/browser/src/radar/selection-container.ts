import { SpaceObject, SpaceState } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { GameRoom } from '../client';

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

    constructor(space: SpaceState) {
        space.events.on('remove', (spaceObject: SpaceObject) => {
            if (this.selectedItems.delete(spaceObject)) {
                this.events.emit(spaceObject.id);
            }
        });
    }

    public clear() {
        const changed = [...this.selectedItems];
        this.selectedItems.clear();
        for (const spaceObject of changed) {
            this.events.emit(spaceObject.id);
        }
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
    }

    public has(o: SpaceObject) {
        return this.selectedItems.has(o);
    }

    public getSingle(): SpaceObject | undefined {
        return this.selectedItems.values().next().value;
    }
}
