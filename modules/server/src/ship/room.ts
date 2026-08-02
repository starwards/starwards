import {
    ShipManager,
    ShipState,
    cmdReceivers,
    createLogger,
    handleJsonPointerCommand,
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
        this.onMessage('*', (_, type, message: unknown) => {
            if (!handleJsonPointerCommand(message, type, manager.state)) {
                logError(`onMessage for message="${JSON.stringify(message)}" not registered.`);
            }
        });
    }
}
