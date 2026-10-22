import { ShipState, getSystems, magazineStocks } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';

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
 */
export const IDEALS = ['ammo', 'stock', 'cap', 'nohit', 'eff', 'gvts', 'dmg2'] as const;
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

function refill(state: ShipState) {
    for (const at of magazineStocks) setStock(state.magazine, at, state.magazine.getMax(at));
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
    const keepCapacity = ideals.some((i) => i === 'cap' || i === 'nohit' || i === 'ammo');
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
    return (game) => {
        const player = game.api.getShip(TRAINING_PLAYER_ID)?.state;
        if (!player) return;
        if (!installed) {
            installed = true;
            installHitRules(game, ideals);
            if (ideals.includes('eff')) enlarge(player);
        }
        if (ideals.includes('ammo') || ideals.includes('stock')) refill(player);
        if (ideals.includes('gvts')) heal(player);
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
