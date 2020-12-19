import { AdminState } from '..';
import { BooleanPropertyCommand } from './property-constructors';

export const shouldGameBeRunning = BooleanPropertyCommand<'admin'>(
    'shouldGameBeRunning',
    (state: AdminState, value: boolean) => {
        state.shouldGameBeRunning = value;
    }
);
