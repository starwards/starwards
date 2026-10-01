import {
    GM_SET_VALUE,
    ShipManager,
    ShipState,
    cmdReceivers,
    createLogger,
    handleGmSetValueCommand,
    handleJsonPointerCommand,
    lockCommands,
    repairCommands,
} from '@starwards/core/internal';

import { Room } from '@colyseus/core';

const { error: logError } = createLogger('ship-room');

export class ShipRoom extends Room<ShipState> {
    constructor() {
        super();
        this.autoDispose = false;
    }

    public onCreate({ manager }: { manager: ShipManager }) {
        this.roomId = manager.spaceObject.id;
        this.setState(manager.state);
        // repair is a player-controlled mechanic (RepairManager is only constructed for
        // ShipManagerPc) — an NPC ship has nothing to drain these commands, so registering them
        // would just let enqueueCommands/etc. accumulate forever with no consumer
        if (manager.state.isPlayerShip) {
            for (const [cmdName, handler] of cmdReceivers(repairCommands, manager)) {
                this.onMessage(cmdName, handler);
            }
        }
        // GM property locks apply to any ship (NPC or player) — the GM tweak panel tweaks both.
        for (const [cmdName, handler] of cmdReceivers(lockCommands, manager)) {
            this.onMessage(cmdName, handler);
        }
        // GM tweak panel's write channel — must be registered under its own message name so it
        // never reaches the '*' catch-all below, and routed through handleGmSetValueCommand so
        // it bypasses the property lock (invariant I10: the GM outranks the lock).
        this.onMessage(GM_SET_VALUE, (_, message: unknown) => {
            if (!handleGmSetValueCommand(message, manager.state)) {
                logError(`GM onMessage for message="${JSON.stringify(message)}" not registered.`);
            }
        });
        this.onMessage('*', (_, type, message: unknown) => {
            if (!handleJsonPointerCommand(message, type, manager.state)) {
                logError(`onMessage for message="${JSON.stringify(message)}" not registered.`);
            }
        });
    }
}
