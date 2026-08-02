import { CancelRepairArg, EnqueueRepairArg, ReorderRepairArg } from './repair-queue';

import { ShipState } from './ship-state';

export const enqueueRepair = {
    cmdName: 'enqueueRepair',
    setValue: (state: ShipState, value: EnqueueRepairArg) => {
        state.repairQueue.enqueueCommands.push(value);
    },
};

export const cancelRepair = {
    cmdName: 'cancelRepair',
    setValue: (state: ShipState, value: CancelRepairArg) => {
        state.repairQueue.cancelCommands.push(value);
    },
};

export const reorderRepair = {
    cmdName: 'reorderRepair',
    setValue: (state: ShipState, value: ReorderRepairArg) => {
        state.repairQueue.reorderCommands.push(value);
    },
};
