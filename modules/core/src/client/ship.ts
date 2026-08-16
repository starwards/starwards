import { Primitive, wireEvents } from 'colyseus-events';
import { RoomEventEmitter, getSystems, sendJsonCmd } from '..';

import EventEmitter2 from 'eventemitter2';
import { Room } from 'colyseus.js';
import { ShipState } from '../ship';
import { StateCommand } from '../commands';
import { waitForEvents } from '../async-utils';

export type ShipDriver = Awaited<ReturnType<typeof ShipDriver>>;

const emitter2Options = {
    wildcard: true,
    delimiter: '/',
    maxListeners: 0,
};

export async function ShipDriver(shipRoom: Room<ShipState>) {
    const events = new EventEmitter2(emitter2Options) as RoomEventEmitter;
    // wire commulative events
    events.on('/armor/armorPlates/*/layers/*/health', (e) => {
        events.emit(`/armor/numberOfHealthyPlates`, e);
    });
    // IMPORTANT: colyseus-events v4 requires passing the room instead of room.state
    // We must wait for the first state sync before calling wireEvents because:
    // 1. The room's state may not be fully initialized immediately after connection
    // 2. Reference IDs (refIds) need to be set up for proper object tracking
    // 3. wireEvents needs access to the full state tree to set up listeners
    await new Promise<void>((resolve) => {
        shipRoom.onStateChange.once(() => {
            wireEvents(shipRoom, events);
            resolve();
        });
    });
    const pendingEvents = [];
    if (!shipRoom.state.design) {
        pendingEvents.push('/design');
    }
    if (!shipRoom.state.thrusters) {
        pendingEvents.push('/thrusters');
    }
    if (!shipRoom.state.armor) {
        pendingEvents.push('/armor');
    }
    await waitForEvents(events, pendingEvents);
    const systems = getSystems(shipRoom.state);
    for (const system of systems) {
        for (const defectible of system.defectibles) {
            events.on(`${system.pointer}/${defectible.field}`, (e) => {
                events.emit(`${system.pointer}/broken`, e);
            });
        }
        // `bearingCommand` (Turret) is a getter over the synced `bearingCommandRaw` — colyseus
        // change tracking only knows about the real field, so re-emit under the logical name too.
        if ('bearingCommandRaw' in system.state) {
            events.on(`${system.pointer}/bearingCommandRaw`, (e) => {
                events.emit(`${system.pointer}/bearingCommand`, e);
            });
        }
        // `ShipState.healthRatio` (issue #2191) is derived from every system's `broken` getter, so
        // it must re-fire whenever any one of them does -- same bridging as the two synthetic
        // events above, needed because colyseus change tracking only fires for real schema fields.
        events.on(`${system.pointer}/broken`, (e) => {
            events.emit(`/healthRatio`, e);
        });
    }
    return {
        events,
        id: shipRoom.state.id,
        get state() {
            return shipRoom.state;
        },
        systems,
        sendJsonCmd: (pointerStr: string, value: Primitive) => sendJsonCmd(shipRoom, pointerStr, value),
        command: <T>(cmd: StateCommand<T, ShipState, void>, value: T) => {
            shipRoom.send(cmd.cmdName, { value, path: undefined });
        },
    };
}
