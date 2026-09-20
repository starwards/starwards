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

/**
 * Engineer screen is the only bearer of engineering hotkeys and already exhausts the alphanumeric
 * keyboard on per-system power/coolant pairs (see `engineer.ts`'s `keyPairs`), so the catalog gets its
 * own modifier namespace rather than fighting over what's left. Alt (not Ctrl) specifically:
 * Ctrl+1..9 is bound to browser tab-switching in Chrome/Firefox and would never reach the page.
 * Assigned by fixed catalog position (every protocol always gets a slot, see issue #2247), not by
 * the per-ship visible subset — so a protocol's key never shifts as tier/energy-cell refusals come
 * and go, and stays stable even for a row hidden because this ship structurally lacks the
 * equipment (see `isRepairSlotVisible`). A protocol *added* to the catalog does shift every key
 * after it, same as inserting a row in the middle of any position-indexed list; overflow past the
 * digit row spills onto the qwerty row.
 *
 * Kept in this pure `-logic` module rather than `repair-queue.ts` (issue #2255) so it can be unit
 * tested without pulling in that widget's Tweakpane/DOM imports, which Jest can't transform.
 */
const REPAIR_PROTOCOL_HOTKEYS = [
    'alt+1',
    'alt+2',
    'alt+3',
    'alt+4',
    'alt+5',
    'alt+6',
    'alt+7',
    'alt+8',
    'alt+9',
    'alt+0',
    'alt+q',
    'alt+w',
    'alt+e',
    'alt+r',
    'alt+t',
];

/** The raise hotkey assigned to `protocolId`, or `undefined` if the catalog has grown past `REPAIR_PROTOCOL_HOTKEYS`. */
export function getRepairProtocolHotkey(
    protocolId: string,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
): string | undefined {
    const index = Object.keys(catalog).indexOf(protocolId);
    return index >= 0 ? REPAIR_PROTOCOL_HOTKEYS[index] : undefined;
}

/** The lower hotkey for `protocolId` — the same digit/letter as the raise hotkey, with `shift` added. */
export function getRepairProtocolLowerHotkey(
    protocolId: string,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
): string | undefined {
    const raise = getRepairProtocolHotkey(protocolId, catalog);
    return raise ? raise.replace('alt+', 'alt+shift+') : undefined;
}

/**
 * The mode-toggle hotkey for `protocolId` (issue #2255) — the same digit/letter as the raise
 * hotkey, with `ctrl+` added instead of `shift+`, so it occupies a gesture of its own rather than
 * folding mode into the priority ladder or reusing the lower-hotkey's modifier. Deliberately
 * `ctrl+alt+`, not bare `ctrl+` — `ctrl+1..9`/`ctrl+w`/`ctrl+t` are reserved by the browser itself
 * (tab-switching, close tab, new tab) and would never reach the page, the same reason
 * `REPAIR_PROTOCOL_HOTKEYS` uses `alt+` rather than `ctrl+` for the raise hotkey in the first
 * place; stacking `ctrl+` onto the already-unclaimed `alt+` gesture keeps this free of both that
 * reservation and every other binding in this module. `undefined` for a docked/shipyard-tier
 * protocol (single-mode: nothing to toggle) or an unknown id.
 */
export function getRepairProtocolModeHotkey(
    protocolId: string,
    catalog: Record<string, RepairProtocolStats> = repairProtocols,
): string | undefined {
    const protocol = catalog[protocolId];
    if (!protocol || protocol.tier !== 'field') {
        return undefined;
    }
    const raise = getRepairProtocolHotkey(protocolId, catalog);
    return raise ? raise.replace('alt+', 'ctrl+alt+') : undefined;
}
