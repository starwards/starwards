import { RepairProtocolStats, ShipState, hasProtocolEquipment, repairProtocols } from '@starwards/core';

/**
 * Whether a catalog protocol's row should render at all in the repair-queue widget. Equipment fit
 * is fixed per ship design, so a protocol targeting a system this ship structurally lacks (e.g. a
 * chain-gun protocol on a ship with no chain gun) never shows — unlike a tier- or energy-cell-gated
 * protocol, which stays visible and explains itself through the slot's own `refusalReason` (issue
 * #2247 review). Equipment fit never changes for a ship instance, so a single check at draw time is
 * enough — no live re-render needed.
 */
export function isRepairSlotVisible(
    state: ShipState,
    protocolId: string,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
): boolean {
    const protocol = catalog[protocolId];
    return !protocol || hasProtocolEquipment(state, protocol);
}
