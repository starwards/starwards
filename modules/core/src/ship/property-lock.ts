import { ShipState } from './ship-state';

/**
 * GM tweak panel per-property lock: while a JSON path is locked, the GM-set value wins and every
 * other writer (JSON pointer commands and manager-driven runtime writes alike) is silently
 * ignored, until the path is unlocked.
 */
export const lockPath = {
    cmdName: 'lockPath',
    setValue: (state: ShipState, path: string) => {
        state.lockPathCommands.push(path);
    },
};

export const unlockPath = {
    cmdName: 'unlockPath',
    setValue: (state: ShipState, path: string) => {
        state.unlockPathCommands.push(path);
    },
};

export function isPathLocked(state: ShipState, path: string): boolean {
    return state.lockedPaths.includes(path);
}

export function drainLockCommands(state: ShipState) {
    for (const path of state.lockPathCommands) {
        if (!state.lockedPaths.includes(path)) {
            state.lockedPaths.push(path);
        }
    }
    state.lockPathCommands.length = 0;
    for (const path of state.unlockPathCommands) {
        const idx = state.lockedPaths.indexOf(path);
        if (idx !== -1) {
            state.lockedPaths.splice(idx, 1);
        }
    }
    state.unlockPathCommands.length = 0;
}
