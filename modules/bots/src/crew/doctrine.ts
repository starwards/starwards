import { CREW_ORDER_KINDS, OrderSlot } from '@starwards/core/internal';
import { GivenOrder, OrderCommand, OrdersBoard, armorShare, orderCommand, paramsArg } from './orders';

import { Display } from '../brain/controls';

type XY = { x: number; y: number };
type Contact = { name?: string; position?: XY; radius?: number; type?: string; faction?: number; distance: number };
type Radar = { ownShip?: { position?: XY; heading?: number; faction?: number }; contacts?: Contact[] };

/** How close doctrine closes on a reported enemy, metres. Hand-written and frozen: never tuned. */
export const DOCTRINE_CLOSE_METERS = 2000;
/** The armor share below which doctrine's standing dock order sends the ship to the dock. */
export const DOCTRINE_DOCK_BELOW = 0.5;
/** The armor share at which doctrine casts off from a dock it sent the ship to. */
export const DOCTRINE_UNDOCK_AT = 0.95;
/** A contact this wide or wider is a station a ship docks at, not a ship. */
const DOCK_HOST_RADIUS = 200;

/** `N° right of the nose` → N, `left` → −N, `dead on the nose` → 0. */
function offNose(words: string | undefined): number | undefined {
    if (words === undefined) return undefined;
    if (words.startsWith('dead')) return 0;
    const m = /^(\d+)° (right|left)/.exec(words);
    return m ? Number(m[1]) * (m[2] === 'right' ? 1 : -1) : undefined;
}

/**
 * The crew's standing procedure: a small, fixed rule set that fills a board slot only while no
 * captain order holds it. It is deliberately basic and frozen (never mined, tuned or derived from
 * a captain): a captain earns its seat only by beating it. Rules:
 *
 * 1. signals says `enemy_position` → `close_to` that enemy, {@link DOCTRINE_CLOSE_METERS} (maneuver);
 * 2. weapons says `target_locked` → `engage`, naming no ship (engagement);
 * 3. a seat's radar shows an allied dock → `dock_below_armor` there at {@link DOCTRINE_DOCK_BELOW} (repair);
 * 4. docked by its own dock order and armor back to {@link DOCTRINE_UNDOCK_AT} → `undock` (navigation).
 *
 * It writes through the board's commands with issuer `doctrine`, so a captain order replaces it,
 * a captain's revoke hands the slot back to it, and it never overwrites a captain order.
 */
export function crewDoctrine() {
    const wanted = new Map<OrderSlot, { given: GivenOrder; origin: string }>();
    let armor: number | undefined;
    const want = (given: GivenOrder, origin: string) =>
        wanted.set(CREW_ORDER_KINDS[given.kind].slot, { given, origin });
    return {
        /** A callout one seat put on the air, with that seat's display (its own ship's place and heading). */
        hear(speaker: string, said: { callout: string; values?: Record<string, string> }, display: Display) {
            const ship = (display.radar as Radar | undefined)?.ownShip;
            if (speaker === 'signals' && said.callout === 'enemy_position') {
                const off = offNose(said.values?.bearing);
                const range = Number(said.values?.range) * 1000;
                if (off === undefined || !Number.isFinite(range) || !ship?.position) return;
                const rad = (((ship.heading ?? 0) + off) * Math.PI) / 180;
                want(
                    {
                        kind: 'close_to',
                        params: {
                            target: {
                                name: said.values?.name,
                                position: {
                                    x: ship.position.x + range * Math.cos(rad),
                                    y: ship.position.y + range * Math.sin(rad),
                                },
                            },
                            range: DOCTRINE_CLOSE_METERS,
                        },
                    },
                    'signals',
                );
            } else if (speaker === 'weapons' && said.callout === 'target_locked') {
                want({ kind: 'engage' }, 'weapons');
            }
        },
        /** What a seat's display shows: an allied dock, and the armor. */
        see(station: string, display: Display) {
            const radar = display.radar as Radar | undefined;
            const faction = radar?.ownShip?.faction;
            if (!wanted.has('repair')) {
                const dock = (radar?.contacts ?? [])
                    .filter(
                        (c) =>
                            c.type === 'Spaceship' &&
                            faction !== undefined &&
                            c.faction === faction &&
                            (c.radius ?? 0) >= DOCK_HOST_RADIUS &&
                            c.position,
                    )
                    .sort((a, b) => a.distance - b.distance)[0];
                if (dock) {
                    want(
                        {
                            kind: 'dock_below_armor',
                            params: {
                                station: { name: dock.name, position: dock.position, radius: dock.radius },
                                threshold: DOCTRINE_DOCK_BELOW,
                            },
                        },
                        station,
                    );
                }
            }
            if (station === 'helms') armor = armorShare(display);
        },
        /** The commands that bring each slot doctrine wants to its order, where no captain order stands in the way. */
        commands(board: OrdersBoard | undefined): OrderCommand[] {
            const orders = board?.orders ?? [];
            const nav = orders.find((o) => o.slot === 'navigation');
            if (
                nav?.issuer === 'doctrine' &&
                nav.kind === 'dock_for_repair' &&
                nav.status === 'complete' &&
                armor !== undefined &&
                armor >= DOCTRINE_UNDOCK_AT
            ) {
                want({ kind: 'undock' }, 'helms');
            }
            const out: OrderCommand[] = [];
            for (const [slot, { given, origin }] of wanted) {
                const current = orders.find((o) => o.slot === slot);
                if (current?.issuer === 'captain') continue;
                if (
                    current?.kind === given.kind &&
                    JSON.stringify(paramsArg(current.params)) === JSON.stringify(paramsArg(given.params))
                ) {
                    continue;
                }
                const def = CREW_ORDER_KINDS[given.kind];
                const blocked = orders.some(
                    (o) =>
                        o.issuer === 'captain' &&
                        (def.contradicts?.includes(o.kind) ||
                            CREW_ORDER_KINDS[o.kind]?.contradicts?.includes(given.kind)),
                );
                const c = !blocked && orderCommand(given, 'doctrine', origin);
                if (c) out.push(c);
            }
            return out;
        },
    };
}

export type CrewDoctrine = ReturnType<typeof crewDoctrine>;
