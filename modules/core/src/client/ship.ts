import { NEED_SNAPSHOT, NeedSnapshotMessage, SNAPSHOT, ShipState, SnapshotMessage } from '../ship';
import { Primitive, wireEvents } from 'colyseus-events';
import { RoomEventEmitter, getSystems, sendGmJsonCmd, sendJsonCmd } from '..';

import EventEmitter2 from 'eventemitter2';
import { Room } from '@colyseus/sdk';
import { StateCommand } from '../commands';
import { waitForEvents } from '../async-utils';

export type ShipDriver = Awaited<ReturnType<typeof ShipDriver>>;

const emitter2Options = {
    wildcard: true,
    delimiter: '/',
    maxListeners: 0,
};

export async function ShipDriver(shipRoom: Room<unknown, ShipState>) {
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
        // GM tweak panel's write channel: bypasses the property lock (see lock-registry.ts
        // withLockBypass) so the GM's operational decision always overrides it. Every other
        // writer must keep using sendJsonCmd.
        sendGmJsonCmd: (pointerStr: string, value: Primitive) => sendGmJsonCmd(shipRoom, pointerStr, value),
        command: <T>(cmd: StateCommand<T, ShipState, void>, value: T) => {
            shipRoom.send(cmd.cmdName, { value, path: undefined });
        },
        /** asks this ship's room for its faction's snapshot of a target (SPEC-0008) */
        needSnapshot: (msg: NeedSnapshotMessage) => shipRoom.send(NEED_SNAPSHOT, msg),
        /** @returns unsubscribe */
        onSnapshot: (cb: (msg: SnapshotMessage) => void): (() => void) => shipRoom.onMessage(SNAPSHOT, cb),
    };
}

/**
 * A `ShipDriver` over a detached, never-changing `ShipState` (a decoded snapshot), so the station
 * widgets draw it exactly as they draw a live ship. No events ever fire; every write is dropped.
 */
export function snapshotShipDriver(state: ShipState): ShipDriver {
    const noop = () => undefined;
    return {
        events: new EventEmitter2(emitter2Options) as RoomEventEmitter,
        id: state.id,
        state,
        systems: getSystems(state),
        sendJsonCmd: noop,
        sendGmJsonCmd: noop,
        command: noop,
        needSnapshot: noop,
        onSnapshot: () => noop,
    };
}
