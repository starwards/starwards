import * as _repairCommands from './repair-commands';

export * from './armor';
export * from './chain-gun';
export * from './damage-manager';
export * from './docking';
export * from './make-ship-state';
export * from './radar';
export * from './reactor';
export * from './repair-commands';
export * from './repair-manager';
export * from './repair-queue';
export * from './ship-areas';
export * from './ship-die';
export * from './ship-direction';
export * from './ship-manager';
export * from './ship-manager-abstract';
export * from './ship-state';
export * from './signals';
export * from './signals-job';
export * from './signals-job-manager';
export * from './smart-pilot';
export * from './system';
export * from './thruster';
export * from './turret';
export * from './warp';

// Named for what it aggregates today (only repair-commands.ts) rather than "all ship commands" —
// a future ship command module must be added to this bundle explicitly, the same as
// `spaceCommands` in `../space/index.ts`.
export const repairCommands = _repairCommands;
