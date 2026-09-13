import { CycleRepairPriorityArg } from './repair-queue';

import { ShipState } from './ship-state';

export const cycleRepairPriority = {
    cmdName: 'cycleRepairPriority',
    setValue: (state: ShipState, value: CycleRepairPriorityArg) => {
        state.repairQueue.cyclePriorityCommands.push(value);
    },
};
