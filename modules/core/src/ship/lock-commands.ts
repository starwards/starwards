import { SetPropertyLockArg, ShipState } from './ship-state';

export const setPropertyLock = {
    cmdName: 'setPropertyLock',
    setValue: (state: ShipState, value: SetPropertyLockArg) => {
        state.propertyLockCommands.push(value);
    },
};
