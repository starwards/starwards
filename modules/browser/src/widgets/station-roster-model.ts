import { BridgeSeat, botSeatsConflict, rosterSeats, seatScreens } from '@starwards/core';

type Entry = { id: string; connected: boolean; shipId: string; stationType: string };
type Bot = { brain: string; status: string; message: string };

/**
 * The GM roster as data: per player ship, each roster seat with its bot and the client (registry
 * entry) holding each enabled screen. A seat with screens but neither bot nor client is `unassigned`;
 * a bot-only seat (no screens) is optional. `botBlockedBy` names a seat whose bot plays a station this
 * seat's bot would also play, while this seat has no bot of its own.
 */
export function rosterModel<E extends Entry>(input: {
    playerShipIds: readonly string[];
    stations: Iterable<E>;
    bots: (shipId: string, seat: BridgeSeat) => Bot | undefined;
    enabledScreens: (shipId: string) => readonly string[];
}) {
    const entries = [...input.stations];
    const matches = (e: E, shipId: string, screen: string) => e.shipId === shipId && e.stationType === screen;
    // a live client beats a stale (disconnected, sticky) entry on the same screen
    const holderOf = (shipId: string, screen: string) =>
        entries.find((e) => e.connected && matches(e, shipId, screen)) ??
        entries.find((e) => matches(e, shipId, screen)) ??
        null;
    const ships = input.playerShipIds.map((shipId) => {
        const enabled = input.enabledScreens(shipId);
        return {
            shipId,
            seats: rosterSeats.map((seat) => {
                const screens = seatScreens(seat)
                    .filter((screen) => enabled.includes(screen))
                    .map((screen) => ({ screen, holder: holderOf(shipId, screen) }));
                const bot = input.bots(shipId, seat) ?? null;
                const botBlockedBy =
                    (!bot && rosterSeats.find((other) => botSeatsConflict(seat, other) && input.bots(shipId, other))) ||
                    null;
                return {
                    seat,
                    bot,
                    botBlockedBy,
                    screens,
                    unassigned: !bot && screens.length > 0 && screens.every((s) => !s.holder),
                };
            }),
        };
    });
    const shown = new Set(ships.flatMap((ship) => ship.seats.flatMap((seat) => seat.screens.map((s) => s.holder))));
    return {
        ships,
        /** Connected clients no seat row shows: no ship, or a ship/screen the roster does not list. */
        unassignedClients: entries.filter((e) => e.connected && !shown.has(e)).map((e) => e.id),
    };
}
