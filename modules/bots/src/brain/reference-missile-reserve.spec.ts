import { Capabilities, Display, stationControls } from './controls';
import { REFERENCE_KNOB_DEFAULTS, setReferenceKnobs } from './reference-knobs';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = {
    commands: [
        { command: 'fireTube', count: 1 },
        { command: 'tubeSafety', count: 1 },
    ],
};

/** A loaded HE tube dead ahead, the locked ship 3 km ahead, `missiles` HE missiles left in the magazine. */
function display(missiles: number): Display {
    return {
        panels: {
            'tubes-status': [
                {
                    index: 0,
                    safetyLocked: true,
                    loadAmmo: true,
                    loadedProjectile: 'HiExpMissile',
                    loading: 1,
                    bearing: 0,
                },
            ],
            'targeting-status': { targetId: 'enemy' },
            'ammo-status': { fitted: true, ammo: { HiExpMissile: { count: missiles, max: 12 } } },
            'systems-status': [],
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 } },
            contacts: [
                {
                    id: 'enemy',
                    type: 'Spaceship',
                    position: { x: 3000, y: 0 },
                    scanLevel: 'BASIC',
                    bearing: 0,
                    distance: 3000,
                },
            ],
        },
    };
}

async function fireTube(shown: Display, policy = makeReferencePolicy(1)) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const result = await policy.answer({} as BrainRequest, controls, shown);
    return result.answers['fireTube:0'].choice;
}

afterEach(() => setReferenceKnobs());

describe('reference weapons missile reserve', () => {
    it('is off by default: launches with an empty magazine behind the loaded round', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.MISSILE_RESERVE).toBe(0);
        expect(await fireTube(display(0))).toBe('fire');
    });

    it('MISSILE_RESERVE holds launches that leave fewer of the type, until MISSILE_RESERVE_SECONDS', async () => {
        setReferenceKnobs({ MISSILE_RESERVE: 4, MISSILE_RESERVE_SECONDS: 20 });
        expect(await fireTube(display(4))).toBe('fire');
        expect(await fireTube(display(3))).toBe('hold_fire');
        const policy = makeReferencePolicy(1);
        for (let i = 1; i < 20; i++) expect(await fireTube(display(3), policy)).toBe('hold_fire');
        expect(await fireTube(display(3), policy)).toBe('fire');
    });
});

describe('reference weapons missile escalation', () => {
    it('is off by default: launches with no gunfire at the lock', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.MISSILE_ESCALATE_SECONDS).toBe(0);
        expect(await fireTube(display(5))).toBe('fire');
    });

    it('MISSILE_ESCALATE_SECONDS holds launches until the gun fired that long at the lock', async () => {
        setReferenceKnobs({ MISSILE_ESCALATE_SECONDS: 6 });
        const policy = makeReferencePolicy(1);
        for (let i = 0; i < 12; i++) expect(await fireTube(display(5), policy)).toBe('hold_fire');
    });

    it('launches once the gun fired MISSILE_ESCALATE_SECONDS at the lock', async () => {
        setReferenceKnobs({ MISSILE_ESCALATE_SECONDS: 3 });
        const gunCaps: Capabilities = {
            commands: [...capabilities.commands, { command: 'fireChainGun', count: 1 }],
        };
        const policy = makeReferencePolicy(1);
        const choices: string[] = [];
        for (let i = 0; i < 6; i++) {
            const shown = display(5);
            const controls = stationControls({ display: shown, capabilities: gunCaps, burstSeconds: 1 });
            const result = await policy.answer({} as BrainRequest, controls, shown);
            const gun = Object.entries(result.answers).find(([id]) => id.startsWith('fireChainGun'))?.[1].choice;
            choices.push(`${gun}/${result.answers['fireTube:0'].choice}`);
        }
        expect(choices.slice(0, 3)).toEqual(['fire/hold_fire', 'fire/hold_fire', 'fire/hold_fire']);
        expect(choices[3]).toBe('fire/fire');
    });
});

describe('reference weapons tube ammo fallback', () => {
    const tubeCaps: Capabilities = { commands: [{ command: 'changeTubeAmmo', count: 1 }] };
    const shown = (projectile: string, loading: number, stock: Record<string, number>): Display => ({
        panels: {
            'tubes-status': [
                { index: 0, projectile, loadedProjectile: loading ? projectile : 'None', loading, bearing: 0 },
            ],
            'ammo-status': {
                fitted: true,
                ammo: Object.fromEntries(Object.entries(stock).map(([k, count]) => [k, { count, max: 20 }])),
            },
            'systems-status': [],
        },
        radar: { ownShip: { heading: 0, position: { x: 0, y: 0 } }, contacts: [] },
    });
    const change = async (d: Display) => {
        const controls = stationControls({ display: d, capabilities: tubeCaps, burstSeconds: 1 });
        const result = await makeReferencePolicy(1).answer({} as BrainRequest, controls, d);
        return result.answers['changeTubeAmmo:0'].choice;
    };

    it('is off by default', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.TUBE_AMMO_FALLBACK).toBe(0);
        expect(await change(shown('HiExpMissile', 0, { HiExpMissile: 0, ArmPenMissile: 5 }))).not.toBe('press');
    });

    it('switches an empty, unloaded tube to the next stocked missile type, and keeps a loaded or stocked one', async () => {
        setReferenceKnobs({ TUBE_AMMO_FALLBACK: 1 });
        expect(await change(shown('HiExpMissile', 0, { HiExpMissile: 0, ArmPenMissile: 5 }))).toBe('press');
        expect(await change(shown('ElecMissile', 0, { HiExpMissile: 0, ArmPenMissile: 5, ElecMissile: 0 }))).toBe(
            'press',
        );
        expect(await change(shown('ArmPenMissile', 0, { HiExpMissile: 0, ArmPenMissile: 5 }))).toBe('wait');
        expect(await change(shown('HiExpMissile', 1, { HiExpMissile: 0, ArmPenMissile: 5 }))).toBe('wait');
        expect(await change(shown('HiExpMissile', 0, { HiExpMissile: 0, ArmPenMissile: 0, FragMissile: 0 }))).toBe(
            'wait',
        );
    });

    it('TUBE_AMMO_AP_FIRST re-types an unloaded tube to AP while AP lasts, then HE', async () => {
        setReferenceKnobs({ TUBE_AMMO_FALLBACK: 1, TUBE_AMMO_AP_FIRST: 1 });
        const reloading = (projectile: string, stock: Record<string, number>) => {
            const d = shown(projectile, 0, stock);
            (d.panels['tubes-status'] as unknown as { loading: number }[])[0].loading = 0.4;
            return d;
        };
        expect(await change(reloading('HiExpMissile', { HiExpMissile: 5, ArmPenMissile: 5 }))).toBe('press');
        expect(await change(reloading('ArmPenMissile', { HiExpMissile: 5, ArmPenMissile: 5 }))).toBe('wait');
        expect(await change(reloading('ArmPenMissile', { HiExpMissile: 5, ArmPenMissile: 0 }))).toBe('press');
        expect(await change(shown('HiExpMissile', 1, { HiExpMissile: 5, ArmPenMissile: 5 }))).toBe('wait');
    });
});

describe('reference weapons missile station gate', () => {
    const withStation = (x: number): Display => {
        const shown = display(5);
        const radar = shown.radar as { ownShip: { faction?: string }; contacts: unknown[] };
        radar.ownShip.faction = 'GRAVITAS';
        radar.contacts.push({
            id: 'station',
            type: 'Station',
            faction: 'GRAVITAS',
            radius: 400,
            position: { x, y: 0 },
            bearing: 0,
            distance: x,
        });
        return shown;
    };

    it('is off by default: launches at a lock far from any station', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.MISSILE_STATION_METERS).toBe(0);
        expect(await fireTube(withStation(50_000))).toBe('fire');
    });

    it('MISSILE_STATION_METERS launches only at a lock that near an allied station', async () => {
        setReferenceKnobs({ MISSILE_STATION_METERS: 5000 });
        expect(await fireTube(withStation(50_000))).toBe('hold_fire');
        expect(await fireTube(withStation(6000))).toBe('fire');
    });
});

describe('reference weapons missile finish skip', () => {
    const gunCaps: Capabilities = { commands: [...capabilities.commands, { command: 'fireChainGun', count: 1 }] };
    const play = async (decisions: number) => {
        const policy = makeReferencePolicy(1);
        const tubes: string[] = [];
        for (let i = 0; i < decisions; i++) {
            const shown = display(5);
            const controls = stationControls({ display: shown, capabilities: gunCaps, burstSeconds: 1 });
            const result = await policy.answer({} as BrainRequest, controls, shown);
            tubes.push(result.answers['fireTube:0'].choice);
        }
        return tubes;
    };

    it('is off by default', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.MISSILE_FINISH_SECONDS).toBe(0);
        expect((await play(30)).filter((c) => c === 'fire').length).toBeGreaterThan(1);
    });

    it('MISSILE_FINISH_SECONDS stops launches at a lock the gun fired at that long', async () => {
        setReferenceKnobs({ MISSILE_FINISH_SECONDS: 5 });
        const tubes = await play(30);
        expect(tubes[0]).toBe('fire');
        expect(tubes.slice(6)).not.toContain('fire');
    });
});

describe('reference weapons missile target selection', () => {
    /** The lock `radius` wide, with an allied station and a second enemy `other` metres from that station (the lock is 3 km from it). */
    const shown = (radius: number, other?: number): Display => {
        const d = display(5);
        const radar = d.radar as { ownShip: { faction?: number }; contacts: Record<string, unknown>[] };
        radar.ownShip.faction = 1;
        Object.assign(radar.contacts[0], { radius, faction: 2 });
        radar.contacts.push({
            id: 'station',
            type: 'Spaceship',
            faction: 1,
            radius: 1200,
            position: { x: 6000, y: 0 },
            bearing: 0,
            distance: 6000,
        });
        if (other !== undefined) {
            radar.contacts.push({
                id: 'other',
                type: 'Spaceship',
                faction: 2,
                radius: 11.2,
                position: { x: 6000, y: other },
                bearing: 90,
                distance: 9000,
            });
        }
        return d;
    };

    it('is off by default', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.MISSILE_TARGET_MODE).toBe(0);
        expect(await fireTube(shown(22.4, 1000))).toBe('fire');
    });

    it('kill mode launches only at a hull a salvo likely kills', async () => {
        setReferenceKnobs({ MISSILE_TARGET_MODE: 1 });
        expect(await fireTube(shown(11.2))).toBe('fire');
        expect(await fireTube(shown(22.4))).toBe('hold_fire');
    });

    it('threat mode launches only at the enemy nearest an allied station', async () => {
        setReferenceKnobs({ MISSILE_TARGET_MODE: 2 });
        expect(await fireTube(shown(22.4))).toBe('fire');
        expect(await fireTube(shown(22.4, 5000))).toBe('fire');
        expect(await fireTube(shown(22.4, 1000))).toBe('hold_fire');
    });
});
