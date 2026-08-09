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

    /**
     * @param isReplaying tells whether the game is currently playing back a recording. A station
     * joined during a replay is a viewer: its commands are dropped, so nobody watching can fire
     * a recorded ship's guns or steer it into a wall the recording never had.
     */
    public onCreate({ manager, isReplaying }: { manager: ShipManager; isReplaying?: () => boolean }) {
        this.roomId = manager.spaceObject.id;
        this.setState(manager.state);
        const viewingReplay = () => !!isReplaying?.();
        // repair is a player-controlled mechanic (RepairManager is only constructed for
        // ShipManagerPc) — an NPC ship has nothing to drain these commands, so registering them
        // would just let enqueueCommands/etc. accumulate forever with no consumer
        if (manager.state.isPlayerShip) {
            for (const [cmdName, handler] of cmdReceivers(repairCommands, manager)) {
                this.onMessage(cmdName, (client, message: Parameters<typeof handler>[1]) => {
                    if (viewingReplay()) return;
                    handler(client, message);
                });
            }
        }
        this.onMessage('*', (_, type, message: unknown) => {
            if (viewingReplay()) return;
            if (!handleJsonPointerCommand(message, type, manager.state)) {
                logError(`onMessage for message="${JSON.stringify(message)}" not registered.`);
            }
        });
    }
}
