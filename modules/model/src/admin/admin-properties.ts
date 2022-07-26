import { AdminState } from '..';
import { NumericStatePropertyCommand } from '../api/property-constructors';

export const speedCommand = NumericStatePropertyCommand(
    'speedCommand',
    (state: AdminState, value) => {
        state.speed = value;
    },
    (state: AdminState) => state.speed,
    [0, 2]
);
