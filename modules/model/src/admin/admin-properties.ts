import { AdminState } from '..';

export const speedCommand = {
    cmdName: 'speedCommand',
    setValue: (state: AdminState, value: number) => {
        state.speed = value;
    },
    getValue: (state: AdminState) => state.speed,
    range: [0, 2],
};
