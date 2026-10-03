import { Answer, Policy } from './brain';

import { makeReferencePolicy } from './reference-policy';

/**
 * Scripted seats for validating the weapons and tactical scores: each is the reference seat with one
 * known flaw (or, for `tubes-powered`, one known change), so a score that does not rank it against
 * the reference is not measuring weapons play.
 * - `spray-fire`: holds the reference lock but fires every decision, solution or not.
 * - `wrong-ammo`: the reference, firing Frag shells (no plate damage on a fighter's composite armor).
 * - `no-lock`: never holds a target; fires when the nearest ship is in the gun's arc and range.
 * - `tubes-powered`: the reference engineer, keeping the missile tubes at normal power.
 */
export const SCRIPTED_SEAT_POLICIES = ['spray-fire', 'wrong-ammo', 'no-lock', 'tubes-powered'] as const;
export type ScriptedSeatPolicyName = (typeof SCRIPTED_SEAT_POLICIES)[number];

type Contact = { id: string; distance: number; bearing: number; type?: string; radius?: number };
type Shown = {
    panels: Record<string, unknown>;
    radar?: { ownShip?: { heading?: number }; contacts?: Contact[] };
};

const WRONG_AMMO = 'FragShell';
const FIRE_ARC_DEGREES = 2;
const FIRE_RANGE_METERS = 8000;
const NORMAL_POWER = 0.5;
const SHIP_RADIUS_METERS = 5;

export function makeScriptedSeatPolicy(name: ScriptedSeatPolicyName, decisionSeconds: number): Policy {
    const reference = makeReferencePolicy(decisionSeconds, undefined, name);
    return {
        name,
        async answer(request, controls, shown) {
            const { answers } = await reference.answer(request, controls, shown);
            const display = shown as Shown;
            for (const control of controls) {
                const choice = override(name, control.id, display);
                if (choice !== undefined) answers[control.id] = { choice, source: 'rule' } satisfies Answer;
            }
            return { answers };
        },
    };
}

function override(name: ScriptedSeatPolicyName, id: string, display: Shown): string | undefined {
    const [command, key] = id.split(':');
    switch (name) {
        case 'spray-fire':
            return command === 'fireChainGun' ? 'fire' : undefined;
        case 'wrong-ammo': {
            if (command !== 'changeGunAmmo') return undefined;
            const guns = (display.panels['gun-status'] ?? []) as { index: number; projectile: string }[];
            return guns.find((g) => g.index === Number(key))?.projectile === WRONG_AMMO ? 'wait' : 'press';
        }
        case 'no-lock': {
            if (command === 'target') {
                return (display.panels['targeting-status'] as { targetId?: string } | undefined)?.targetId
                    ? 'clear'
                    : 'none';
            }
            if (command !== 'fireChainGun') return undefined;
            const heading = display.radar?.ownShip?.heading ?? 0;
            const ship = (display.radar?.contacts ?? [])
                .filter((c) => c.type === 'Spaceship' || (c.radius ?? 0) >= SHIP_RADIUS_METERS)
                .sort((a, b) => a.distance - b.distance)[0];
            return ship &&
                Math.abs(((((ship.bearing - heading) % 360) + 540) % 360) - 180) <= FIRE_ARC_DEGREES &&
                ship.distance <= FIRE_RANGE_METERS
                ? 'fire'
                : 'hold_fire';
        }
        case 'tubes-powered': {
            if (command !== 'systemPower' || !key.startsWith('/tubes/')) return undefined;
            const systems = (display.panels['full-systems-status'] ?? []) as { pointer: string; power: number }[];
            const power = systems.find((s) => s.pointer === key)?.power ?? NORMAL_POWER;
            return power < NORMAL_POWER - 0.01 ? 'raise' : power > NORMAL_POWER + 0.01 ? 'lower' : 'hold';
        }
    }
}
