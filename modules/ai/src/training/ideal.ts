import { ShipState, getSystems, magazineStocks } from '@starwards/core';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';

/**
 * Test-only idealizations of the GVTS for ceiling measurements: each tick, before the crew acts,
 * they undo what the game did to the ship. Production rules are untouched.
 *
 * - `ammo`: the magazine is refilled to its maximum and its capacity is never damaged.
 * - `gvts`: the GVTS is invulnerable: armor, capsule and every system defect restored.
 * - `dmg2`: every enemy loses twice the armor and capsule it lost since the previous tick.
 */
export const IDEALS = ['ammo', 'gvts', 'dmg2'] as const;
export type Ideal = (typeof IDEALS)[number];

export function parseIdeals(spec: string): Ideal[] {
    const ideals = spec.split(',').filter(Boolean);
    for (const i of ideals) {
        if (!(IDEALS as readonly string[]).includes(i)) throw new Error(`unknown ideal ${i}; one of ${IDEALS.join(', ')}`);
    }
    return ideals as Ideal[];
}

function refill(state: ShipState) {
    for (const at of magazineStocks) state.magazine.setCount(at, state.magazine.getMax(at));
    state.magazine.capacity = 1;
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
    return (game) => {
        const player = game.api.getShip(TRAINING_PLAYER_ID)?.state;
        if (!player) return;
        if (ideals.includes('ammo')) refill(player);
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
