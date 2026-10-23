import { ShipState, getSystems, magazineStocks, shellAmmoTypes } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { STATIONS } from '@starwards/server/src/scenarios/wave-defence';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import { tapDamage } from '@starwards/server/src/test/damage-tap';

/**
 * Test-only idealizations of the GVTS for ceiling measurements: each tick, before the crew acts,
 * they undo what the game did to the ship. Production rules are untouched.
 *
 * - `ammo`: the magazine is refilled to its maximum and its capacity is never damaged.
 * - `stock`: the magazine is refilled to its (possibly damaged) maximum; hits still shrink capacity.
 * - `cap`: magazine hits never shrink capacity; rounds spent or lost to hits stay gone.
 * - `nohit`: magazine hits do nothing at all.
 * - `eff`: the GVTS starts with half again as many rounds of each type, and holds that many.
 * - `gvts`: the GVTS is invulnerable: armor, capsule and every system defect restored.
 * - `dmg2`: every enemy loses twice the armor and capsule it lost since the previous tick.
 * - `frag`: the GVTS holds no HE or AP shells, and its Frag shells never run dry.
 * - `shells`: like `ammo`, but only the gun's shells are refilled; missiles run down as in play.
 * - `missiles`: like `ammo`, but only missiles are refilled; shells run down as in play.
 * - `duty`: the gun gets no shells during the second half of every 20 s (fire 10 s, pause 10 s);
 *   apply after a refilling ideal, which restores them.
 * - `he900`: at 900 s the magazine gains 8 HE missiles once, past its maximum (later hits still clamp).
 * - `attacker`: the weapons target is forced, each tick after the crew acts, to the latest live
 *   attacker of the station that has taken the most damage (ground truth, not scan).
 * Magazine capacity never damaged is `cap`.
 */
export const IDEALS = [
    'ammo',
    'stock',
    'cap',
    'nohit',
    'eff',
    'gvts',
    'dmg2',
    'frag',
    'shells',
    'missiles',
    'duty',
    'he900',
    'attacker',
] as const;
export type Ideal = (typeof IDEALS)[number];

export function parseIdeals(spec: string): Ideal[] {
    const ideals = spec.split(',').filter(Boolean);
    for (const i of ideals) {
        if (!(IDEALS as readonly string[]).includes(i))
            throw new Error(`unknown ideal ${i}; one of ${IDEALS.join(', ')}`);
    }
    return ideals as Ideal[];
}

type Magazine = ShipState['magazine'];
type MagazineHit = (magazine: Magazine, damageId: string) => void;
type DamageHolder = { damageManager: { damageMagazine: MagazineHit } };

/**
 * Wraps the player's magazine-hit rule; the original still runs, so the die rolls the same.
 * Exported for telemetry, which wraps it the same way.
 */
export function wrapMagazineHit(game: HeadlessGame, wrap: (original: MagazineHit) => MagazineHit) {
    const manager = game.shipManagers.get(TRAINING_PLAYER_ID) as unknown as DamageHolder | undefined;
    if (!manager) return;
    const original = manager.damageManager.damageMagazine.bind(manager.damageManager);
    manager.damageManager.damageMagazine = wrap(original);
}

/** Writes a stock's count past `setCount`, so telemetry sees a refill rather than rounds drawn. */
function setStock(magazine: Magazine, stock: (typeof magazineStocks)[number], value: number) {
    (magazine as unknown as Record<string, number>)[`count_${stock}`] = value;
}

const isShell = (at: string) => (shellAmmoTypes as readonly string[]).includes(at);

function refill(state: ShipState, which: (at: string) => boolean = () => true) {
    for (const at of magazineStocks) if (which(at)) setStock(state.magazine, at, state.magazine.getMax(at));
}

function heal(state: ShipState) {
    for (const plate of state.armor.armorPlates) for (const layer of plate.layers) layer.health = layer.maxHealth;
    state.capsule.integrity = 1;
    for (const system of getSystems(state)) {
        for (const d of system.defectibles) {
            (system.state as unknown as Record<string, number>)[d.field] = d.normal;
        }
    }
}

function installHitRules(game: HeadlessGame, ideals: Ideal[]) {
    const keepCapacity = ideals.some(
        (i) => i === 'cap' || i === 'nohit' || i === 'ammo' || i === 'shells' || i === 'missiles',
    );
    const keepStock = ideals.includes('nohit');
    if (!keepCapacity) return;
    wrapMagazineHit(game, (original) => (magazine, damageId) => {
        const capacity = magazine.capacity;
        const counts = magazineStocks.map((s) => magazine.getCount(s));
        original(magazine, damageId);
        magazine.capacity = capacity;
        if (keepStock) magazineStocks.forEach((s, i) => setStock(magazine, s, counts[i]));
    });
}

function enlarge(state: ShipState) {
    const design = state.magazine.design as unknown as Record<string, number>;
    for (const at of magazineStocks) {
        const count = state.magazine.getCount(at);
        design[`max_${at}`] = Math.round(design[`max_${at}`] * 1.5);
        setStock(state.magazine, at, Math.round(count * 1.5));
    }
}

const HE_GRANT = 8;
const HE_GRANT_SECONDS = 900;

function grantHe(magazine: Magazine) {
    const target = magazine.getCount('HiExpMissile') + HE_GRANT;
    const design = magazine.design as unknown as Record<string, number>;
    if (magazine.capacity > 0)
        design.max_HiExpMissile = Math.max(design.max_HiExpMissile, Math.ceil(target / magazine.capacity));
    magazine.setCount('HiExpMissile', target);
}

/**
 * The attacker to target: the latest attacker still `alive` of the station with the most damage
 * taken, else of the next most damaged station; null when no station has a live attacker.
 */
export function pickStationAttacker(
    damage: ReadonlyMap<string, number>,
    attackers: ReadonlyMap<string, readonly string[]>,
    alive: (id: string) => boolean,
): string | null {
    const stations = [...damage.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    for (const station of stations) {
        const list = attackers.get(station) ?? [];
        for (let i = list.length - 1; i >= 0; i--) if (alive(list[i])) return list[i];
    }
    return null;
}

type Targeter = { update: (id: unknown) => void; setTarget: (id: string | null) => void };

function installAttackerTargeting(game: HeadlessGame, player: ShipState) {
    const manager = game.shipManagers.get(TRAINING_PLAYER_ID) as unknown as Targeter | undefined;
    if (!manager) return;
    const stationIds = new Set(STATIONS.map((s) => s.id));
    const damage = new Map<string, number>();
    const attackers = new Map<string, string[]>();
    tapDamage(game, (id, d) => {
        if (!stationIds.has(id) || !d.shipId) return;
        damage.set(id, (damage.get(id) ?? 0) + d.amount);
        const list = attackers.get(id) ?? [];
        const at = list.indexOf(d.shipId);
        if (at >= 0) list.splice(at, 1);
        list.push(d.shipId);
        attackers.set(id, list);
    });
    const alive = (id: string) => {
        const ship = game.spaceManager.state.getShip(id);
        return !!ship && !ship.destroyed && ship.faction !== player.faction;
    };
    const update = manager.update.bind(manager);
    // runs inside the game's tick, after the crew's commands, before the weapons fire
    manager.update = (id) => {
        const target = pickStationAttacker(damage, attackers, alive);
        if (target) manager.setTarget(target);
        update(id);
    };
}

/** A `script` for `playCrewTraining` applying `ideals`; null when there are none. */
export function idealScript(ideals: Ideal[]): ((game: HeadlessGame) => void) | null {
    if (!ideals.length) return null;
    const last = new Map<string, number>();
    const doubled = (key: string, now: number) => {
        const before = last.get(key);
        const next = before !== undefined && now < before ? Math.max(0, now - (before - now)) : now;
        last.set(key, next);
        return next;
    };
    let installed = false;
    let heGranted = false;
    return (game) => {
        const player = game.api.getShip(TRAINING_PLAYER_ID)?.state;
        if (!player) return;
        if (!installed) {
            installed = true;
            installHitRules(game, ideals);
            if (ideals.includes('eff')) enlarge(player);
            if (ideals.includes('attacker')) installAttackerTargeting(game, player);
        }
        if (ideals.includes('he900') && !heGranted && game.seconds >= HE_GRANT_SECONDS) {
            heGranted = true;
            grantHe(player.magazine);
        }
        if (ideals.includes('ammo') || ideals.includes('stock')) refill(player);
        if (ideals.includes('shells')) refill(player, isShell);
        if (ideals.includes('missiles')) refill(player, (at) => !isShell(at));
        if (ideals.includes('duty') && Math.floor(game.seconds / 10) % 2 === 1) {
            for (const at of shellAmmoTypes) setStock(player.magazine, at, 0);
        }
        if (ideals.includes('gvts')) heal(player);
        if (ideals.includes('frag')) {
            setStock(player.magazine, 'HiExpShell', 0);
            setStock(player.magazine, 'ArmPenShell', 0);
            setStock(player.magazine, 'FragShell', player.magazine.getMax('FragShell'));
        }
        if (ideals.includes('dmg2')) {
            for (const [id, manager] of game.shipManagers) {
                const s = manager.state;
                if (s.faction === player.faction) continue;
                s.armor.armorPlates.forEach((plate, p) =>
                    plate.layers.forEach((layer, l) => {
                        layer.health = doubled(`${id}/${p}/${l}`, layer.health);
                    }),
                );
                s.capsule.integrity = doubled(`${id}/capsule`, s.capsule.integrity);
            }
        }
    };
}
