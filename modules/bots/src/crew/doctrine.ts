import { CREW_ORDER_KINDS, HullStatus, OrderSlot } from '@starwards/core/internal';
import { DOCKING_MODE, GivenOrder, OrderCommand, OrdersBoard, armorShare, orderCommand, paramsArg } from './orders';

import { Display } from '../brain/controls';
import { isEnemyShip } from '../brain/enemy';
import { referenceKnobs } from '../brain/reference-knobs';

type XY = { x: number; y: number };
type Contact = {
    name?: string;
    velocity?: XY;
    position?: XY;
    radius?: number;
    type?: string;
    faction?: number;
    distance: number;
};
type Radar = { ownShip?: { position?: XY; heading?: number; faction?: number }; contacts?: Contact[] };

/** How close doctrine closes on a reported enemy, metres. Hand-written and frozen: never tuned. */
export const DOCTRINE_CLOSE_METERS = 2000;
/** Top speed assumed for a hostile whose velocity is not shown, m/s. */
const ASSUMED_HOSTILE_SPEED = 450;
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
 * Seconds until a hostile reaches the ship: distance over closing speed from the contact's shown
 * position and velocity; a contact moving away is Infinity; one with no velocity is taken at
 * {@link ASSUMED_HOSTILE_SPEED} straight at the ship.
 */
export function hostileEta(c: Contact, ship: XY | undefined): number {
    if (!c.velocity || !c.position || !ship) return c.distance / ASSUMED_HOSTILE_SPEED;
    const dx = ship.x - c.position.x;
    const dy = ship.y - c.position.y;
    const range = Math.hypot(dx, dy);
    if (range === 0) return 0;
    const closing = (c.velocity.x * dx + c.velocity.y * dy) / range;
    return closing > 0 ? range / closing : Infinity;
}

/**
 * The crew's standing procedure: a small, fixed rule set that fills a board slot only while no
 * captain order holds it. It is deliberately basic and frozen (never mined, tuned or derived from
 * a captain): a captain earns its seat only by beating it. Rules:
 *
 * 1. signals says `enemy_position` → `close_to` that enemy, {@link DOCTRINE_CLOSE_METERS} (maneuver);
 * 2. weapons says `target_locked` → `engage`, naming no ship (engagement);
 * 3. a seat's radar shows an allied dock → `dock_below_armor` there at `DOCTRINE_DOCK_BELOW_ARMOR` (repair);
 *    While `DOCK_THREAT_ETA_SECONDS` > 0 the order stands only while every hostile in sight needs at least
 *    that long to reach the ship (see {@link hostileEta}); a standing order stays, so the ETA only gates a dock order not yet stood.
 * 4. docked by its own dock order and armor back to `DOCTRINE_UNDOCK_AT_ARMOR` → `undock` (navigation); the
 *    reference knobs `DOCK_EXIT_*` add further exits (a hostile near, an allied hull hurt, a dock timeout),
 *    all off by default.
 *
 * It writes through the board's commands with issuer `doctrine`, so a captain order replaces it,
 * a captain's revoke hands the slot back to it, and it never overwrites a captain order.
 */
export function crewDoctrine() {
    const wanted = new Map<OrderSlot, { given: GivenOrder; origin: string }>();
    let armor: number | undefined;
    let nearestHostile = Infinity;
    let allyHurt = false;
    let soonestEta = Infinity;
    let now = 0;
    let docked = false;
    /** The doctrine order (the dock order, or the standing one that started it) whose docking the ship is still in, once the dock order's slot has emptied. */
    let dockedBy: number | undefined;
    let dockedSince: { id: number; at: number } | undefined;
    let exitedAt = -Infinity;
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
            const etaKnob = referenceKnobs.DOCK_THREAT_ETA_SECONDS;
            for (const c of radar?.contacts ?? []) {
                if (isEnemyShip(c, faction)) soonestEta = Math.min(soonestEta, hostileEta(c, radar?.ownShip?.position));
            }
            const etaClear = !(etaKnob > 0 && soonestEta < etaKnob);
            if (etaClear && !wanted.has('repair') && now >= exitedAt + referenceKnobs.DOCK_EXIT_HOLDOFF_SECONDS) {
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
                                threshold: referenceKnobs.DOCTRINE_DOCK_BELOW_ARMOR,
                            },
                        },
                        station,
                    );
                }
            }
            for (const c of radar?.contacts ?? []) {
                if (isEnemyShip(c, faction)) nearestHostile = Math.min(nearestHostile, c.distance);
            }
            allyHurt ||= ((display.panels['hull-status'] ?? []) as HullStatus[]).some(
                (r) => r.allied && r.intel === 'LIVE' && r.hull !== undefined && r.hull !== 'intact',
            );
            if (station === 'helms') {
                armor = armorShare(display);
                docked =
                    (display.panels['docking-status'] as { mode?: number } | undefined)?.mode === DOCKING_MODE.DOCKED;
            }
        },
        /** The commands that bring each slot doctrine wants to its order, where no captain order stands in the way. */
        commands(board: OrdersBoard | undefined): OrderCommand[] {
            const orders = board?.orders ?? [];
            wanted.delete('navigation');
            const nav = orders.find((o) => o.slot === 'navigation');
            const out: OrderCommand[] = [];
            now = board?.seconds ?? (nav ? nav.issuedAt + nav.secondsAgo : now);
            const standing = orders.find((o) => o.issuer === 'doctrine' && o.kind === 'dock_below_armor' && o.fired);
            if (nav?.issuer === 'doctrine' && nav.kind === 'dock_for_repair') dockedBy = nav.id;
            else if (!nav && standing) dockedBy = standing.id;
            else if (!nav && !docked) dockedBy = undefined;
            if (!nav && docked && dockedBy !== undefined) {
                if (dockedSince?.id !== dockedBy) dockedSince = { id: dockedBy, at: now };
                const k = referenceKnobs;
                const mayExitOnThreat = armor === undefined || armor >= k.DOCK_EXIT_ARMOR_FLOOR;
                const threat =
                    mayExitOnThreat &&
                    ((k.DOCK_EXIT_THREAT_METERS > 0 && nearestHostile < k.DOCK_EXIT_THREAT_METERS) ||
                        (k.DOCK_EXIT_ALLY_DAMAGED > 0.5 && allyHurt));
                const timeout = k.DOCK_EXIT_TIMEOUT_SECONDS > 0 && now - dockedSince.at >= k.DOCK_EXIT_TIMEOUT_SECONDS;
                if (threat || timeout || (armor !== undefined && armor >= k.DOCTRINE_UNDOCK_AT_ARMOR)) {
                    want({ kind: k.DOCK_EXIT_LAUNCH > 0.5 ? 'launch' : 'undock' }, 'helms');
                }
                if (threat && k.DOCK_EXIT_HOLDOFF_SECONDS > 0) {
                    exitedAt = now;
                    const revoke = orderCommand({ kind: 'revoke', params: { slot: 'repair' } }, 'doctrine');
                    if (revoke) out.push(revoke);
                    wanted.delete('repair');
                }
            }
            nearestHostile = Infinity;
            soonestEta = Infinity;
            allyHurt = false;
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
