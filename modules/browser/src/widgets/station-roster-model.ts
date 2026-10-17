import { BridgeSeat, rosterSeats, seatScreens } from '@starwards/core';

type Entry = { id: string; connected: boolean; shipId: string; stationType: string };
type Bot = { brain: string; status: string; message: string };

/**
 * The GM roster as data: per player ship, each roster seat with its bot and the client (registry
 * entry) holding each enabled screen. A seat with neither bot nor client is `unassigned`.
 */
export function rosterModel<E extends Entry>(input: {
    playerShipIds: readonly string[];
    stations: Iterable<E>;
    bots: (shipId: string, seat: BridgeSeat) => Bot | undefined;
    enabledScreens: (shipId: string) => readonly string[];
}) {
    const entries = [...input.stations];
    const holderOf = (shipId: string, screen: string) =>
        entries.find((e) => e.shipId === shipId && e.stationType === screen) ?? null;
    return {
        ships: input.playerShipIds.map((shipId) => ({
            shipId,
            seats: rosterSeats.map((seat) => {
                const enabled = input.enabledScreens(shipId);
                const screens = seatScreens(seat)
                    .filter((screen) => enabled.includes(screen))
                    .map((screen) => ({ screen, holder: holderOf(shipId, screen) }));
                const bot = input.bots(shipId, seat) ?? null;
                return { seat, bot, screens, unassigned: !bot && screens.every((s) => !s.holder) };
            }),
        })),
        unassignedClients: entries.filter((e) => e.connected && !e.shipId).map((e) => e.id),
    };
}
