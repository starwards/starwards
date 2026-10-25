import * as _crewOrderCommands from './crew-order-commands';
import * as _gmCommands from './gm-commands';
import * as _repairCommands from './repair-commands';

export * from './ammo-manager';
export * from './armor';
export * from './attack-resolution-manager';
export * from './chain-gun';
export * from './crew-orders';
export * from './crew-orders-manager';
export * from './damage-manager';
export * from './docking';
export * from './flight-doctrine';
export * from './flight-profile';
export * from './gun-heat';
export * from './make-ship-state';
export * from './npc-ai-profile';
export * from './radar';
export * from './reactor';
export * from './reactor-cell-manager';
export * from './repair-commands';
export * from './repair-manager';
export * from './repair-queue';
export * from './ship-areas';
export * from './ship-die';
export * from './ship-direction';
export * from './ship-manager';
export * from './ship-manager-abstract';
export * from './ship-snapshot';
export * from './ship-state';
export * from './capsule';
export * from './threat-table';
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
export { MAX_SYSTEM_HEAT } from './heat-manager';
/** The order board's commands: issue an order, revoke a slot, report an order's progress. */
export const crewOrderCommands = _crewOrderCommands;
/** GM quick actions on one ship: resupply (ammo, energy, fuel) and repair (armor, systems). */
export const gmShipCommands = _gmCommands;
