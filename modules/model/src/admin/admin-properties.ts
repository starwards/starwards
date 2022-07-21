import { NumericStatePropertyCommand, PropertyCommand } from '../api/property-constructors';

import { AdminState } from '..';

export const shouldGameBeRunning = PropertyCommand('shouldGameBeRunning', (state: AdminState, value: boolean) => {
    state.shouldGameBeRunning = value;
});

export const speedCommand = NumericStatePropertyCommand(
    'speedCommand',
    (state: AdminState, value) => {
        state.speed = value;
    },
    (state: AdminState) => state.speed,
    [0, 2]
);
