import { AdminState } from '..';
import { PropertyCommand } from '../api/property-constructors';

export const shouldGameBeRunning = PropertyCommand('shouldGameBeRunning', (state: AdminState, value: boolean) => {
    state.shouldGameBeRunning = value;
});
