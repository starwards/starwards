import { Answer, Policy } from './brain';

import { Display } from './controls';
import { Heard } from './callout';

/**
 * The decisions a residual weapons policy may take over from the reference seat; `ref` leaves the head
 * to the reference. `gunAmmo` `ap`/`he` is the AP-opens/HE-finishes choice (`AMMO_OPEN_AP`) made per decision.
 */
export const RESIDUAL_HEADS = {
    missile: ['ref', 'hold', 'launch'],
    tubeAmmo: ['ref', 'he', 'alt'],
    gunAmmo: ['ref', 'he', 'ap'],
    target: ['ref', 'nearest', 'nearest_to_station'],
    gunFire: ['ref', 'hold'],
} as const;
export type ResidualHeads = { [K in keyof typeof RESIDUAL_HEADS]: (typeof RESIDUAL_HEADS)[K][number] };
export const REFERENCE_HEADS: ResidualHeads = {
    missile: 'ref',
    tubeAmmo: 'ref',
    gunAmmo: 'ref',
    target: 'ref',
    gunFire: 'ref',
};

/** Chooses the heads from the seat's shown display and what it heard: nothing else reaches it. */
export type ResidualDecider = (display: Display, heard: readonly Heard[]) => Partial<ResidualHeads>;

let decider: ResidualDecider | undefined;
/** The decider every residual weapons seat asks from now on; none plays the reference. */
export function setResidualWeaponsDecider(next: ResidualDecider | undefined) {
    decider = next;
}

type Contact = {
    id: string;
    distance: number;
    position: { x: number; y: number };
    type?: string;
    faction?: number;
    radius?: number;
};
type Tube = { index: number; projectile: string; loadedProjectile: string; loading: number };

const isShip = (c: Contact) => c.type === 'Spaceship' || (c.type === undefined && (c.radius ?? 0) >= 5);
const SHELL = { he: 'HiExpShell', ap: 'ArmPenShell' } as const;
const MISSILE = { he: 'HiExpMissile', alt: 'ArmPenMissile' } as const;

/**
 * The reference weapons seat with a decider that may override some heads. It keeps the inner policy's
 * name, and its answers stay `rule`; an overridden answer is `model`, so a recording tells them apart.
 * The inner reference keeps its own tallies as if its answers were pressed.
 */
export function makeResidualWeaponsPolicy(inner: Policy): Policy {
    return {
        name: inner.name,
        async answer(request, controls, shown, heard = []) {
            const result = await inner.answer(request, controls, shown, heard);
            if (!decider) return result;
            const heads = { ...REFERENCE_HEADS, ...decider(shown, heard) };
            const display = shown as {
                panels: Record<string, unknown>;
                radar?: { ownShip?: { faction?: number }; contacts?: Contact[] };
            };
            const lockId = (display.panels['targeting-status'] as { targetId?: string | null } | undefined)?.targetId;
            const tubes = (display.panels['tubes-status'] ?? []) as Tube[];
            const stock =
                (display.panels['ammo-status'] as { ammo?: Record<string, { count?: number }> } | undefined)?.ammo ??
                {};
            const launchTube =
                heads.missile === 'launch' && lockId
                    ? tubes.find((t) => t.loadedProjectile !== 'None')?.index
                    : undefined;
            const set = (id: string, choice: string | undefined) => {
                if (choice !== undefined) result.answers[id] = { choice, source: 'model' } satisfies Answer;
            };
            for (const control of controls) {
                const [command, key] = control.id.split(':');
                switch (command) {
                    case 'fireChainGun':
                        if (heads.gunFire === 'hold') set(control.id, 'hold_fire');
                        break;
                    case 'tubeSafety':
                        if (heads.missile === 'hold') set(control.id, 'on');
                        if (heads.missile === 'launch') set(control.id, Number(key) === launchTube ? 'off' : 'on');
                        break;
                    case 'fireTube':
                        if (heads.missile === 'hold') set(control.id, 'hold_fire');
                        if (heads.missile === 'launch')
                            set(control.id, Number(key) === launchTube ? 'fire' : 'hold_fire');
                        break;
                    case 'changeGunAmmo': {
                        if (heads.gunAmmo === 'ref') break;
                        const guns = (display.panels['gun-status'] ?? []) as { index: number; projectile: string }[];
                        const gun = guns.find((g) => g.index === Number(key ?? 0));
                        const wanted = SHELL[heads.gunAmmo];
                        if (gun && (stock[wanted]?.count ?? 0) > 0)
                            set(control.id, gun.projectile === wanted ? 'wait' : 'press');
                        break;
                    }
                    case 'changeTubeAmmo': {
                        if (heads.tubeAmmo === 'ref') break;
                        const tube = tubes.find((t) => t.index === Number(key ?? 0));
                        const wanted = MISSILE[heads.tubeAmmo];
                        if (!tube) break;
                        set(
                            control.id,
                            tube.loadedProjectile === 'None' &&
                                tube.projectile !== wanted &&
                                (stock[wanted]?.count ?? 0) >= 1
                                ? 'press'
                                : 'wait',
                        );
                        break;
                    }
                    case 'target': {
                        if (heads.target === 'ref') break;
                        const want = chosenTarget(display.radar, heads.target);
                        if (want) set(control.id, want.id === lockId ? 'none' : 'next');
                        break;
                    }
                }
            }
            return result;
        },
    };
}

/** The enemy ship a target head names: the nearest, or the one nearest any allied station. */
function chosenTarget(
    radar: { ownShip?: { faction?: number }; contacts?: Contact[] } | undefined,
    head: 'nearest' | 'nearest_to_station',
) {
    const own = radar?.ownShip?.faction;
    const contacts = radar?.contacts ?? [];
    const ally = (c: Contact) => own !== undefined && c.faction === own;
    const enemies = contacts.filter((c) => isShip(c) && !ally(c));
    if (head === 'nearest') return enemies.sort((a, b) => a.distance - b.distance)[0];
    const stations = contacts.filter((c) => c.type === 'Station' && ally(c));
    const gap = (c: Contact) =>
        Math.min(...stations.map((s) => Math.hypot(s.position.x - c.position.x, s.position.y - c.position.y)));
    return stations.length ? enemies.sort((a, b) => gap(a) - gap(b))[0] : undefined;
}
