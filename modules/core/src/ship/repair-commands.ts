import { CycleRepairPriorityArg, ToggleRepairProtocolModeArg } from './repair-queue';

import { ShipState } from './ship-state';

export const cycleRepairPriority = {
    cmdName: 'cycleRepairPriority',
    setValue: (state: ShipState, value: CycleRepairPriorityArg) => {
        state.repairQueue.cyclePriorityCommands.push(value);
    },
};

export const toggleRepairProtocolMode = {
    cmdName: 'toggleRepairProtocolMode',
    setValue: (state: ShipState, value: ToggleRepairProtocolModeArg) => {
        state.repairQueue.toggleModeCommands.push(value);
    },
};
