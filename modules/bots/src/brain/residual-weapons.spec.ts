import { Capabilities, Display, stationControls } from './controls';
import { REFERENCE_HEADS, makeResidualWeaponsPolicy, setResidualWeaponsDecider } from './residual-weapons';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = {
    commands: [
        { command: 'nextTarget' },
        { command: 'clearTarget' },
        { command: 'fireChainGun', count: 1 },
        { command: 'changeGunAmmo', count: 1 },
        { command: 'changeTubeAmmo', count: 2 },
        { command: 'tubeSafety', count: 2 },
        { command: 'fireTube', count: 2 },
    ],
};

const enemy = (id: string, x: number, y: number) => ({
    id,
    name: id,
    scanLevel: 'BASIC',
    type: 'Spaceship',
    faction: 2,
    position: { x, y },
    distance: Math.hypot(x, y),
    bearing: (Math.atan2(y, x) * 180) / Math.PI,
    radius: 10,
});

function display(lock: string | null = 'near'): Display {
    return {
        panels: {
            'gun-status': [{ index: 0, projectile: 'HiExpShell', loadedProjectile: 'HiExpShell', loadAmmo: true }],
            'tubes-status': [
                { index: 0, projectile: 'HiExpMissile', loadedProjectile: 'HiExpMissile', loading: 0, bearing: 0 },
                { index: 1, projectile: 'HiExpMissile', loadedProjectile: 'None', loading: 0, bearing: 0 },
            ],
            'targeting-status': { targetId: lock },
            'ammo-status': {
                fitted: true,
                ammo: {
                    HiExpShell: { count: 40, max: 100 },
                    ArmPenShell: { count: 40, max: 100 },
                    HiExpMissile: { count: 5, max: 10 },
                    ArmPenMissile: { count: 5, max: 10 },
                },
            },
        },
        radar: {
            ownShip: { heading: 0, position: { x: 0, y: 0 }, faction: 1 },
            contacts: [
                enemy('near', 1000, 0),
                enemy('far', 0, 5000),
                {
                    id: 'base',
                    name: 'base',
                    type: 'Station',
                    faction: 1,
                    position: { x: 0, y: 5200 },
                    distance: 5200,
                    bearing: 90,
                    radius: 100,
                    scanLevel: 'FULL',
                },
            ],
        },
    };
}

async function answers(policy: ReturnType<typeof makeReferencePolicy>, shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 0.5 });
    return (await policy.answer({} as BrainRequest, controls, shown, [])).answers;
}

afterEach(() => setResidualWeaponsDecider(undefined));

describe('residual weapons', () => {
    it('with no decider answers exactly as the reference, under the reference name', async () => {
        const residual = makeResidualWeaponsPolicy(makeReferencePolicy(0.5));
        expect(residual.name).toBe('reference');
        for (const lock of ['near', null, 'far']) {
            expect(await answers(residual, display(lock))).toEqual(
                await answers(makeReferencePolicy(0.5), display(lock)),
            );
        }
    });

    it('with an all-ref decider answers exactly as the reference', async () => {
        setResidualWeaponsDecider(() => REFERENCE_HEADS);
        const residual = makeResidualWeaponsPolicy(makeReferencePolicy(0.5));
        const reference = makeReferencePolicy(0.5);
        for (let i = 0; i < 5; i++)
            expect(await answers(residual, display())).toEqual(await answers(reference, display()));
    });

    it('passes the decider only the shown display and what was heard', async () => {
        const seen: unknown[] = [];
        setResidualWeaponsDecider((d, h) => {
            seen.push([d, h]);
            return {};
        });
        const shown = display();
        await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), shown);
        expect(seen).toEqual([[shown, []]]);
    });

    it('the reference tallies what was pressed: a held launch does not start its launch interval', async () => {
        const fired = (a: Record<string, { choice: string }>) =>
            Object.keys(a).some((id) => id.startsWith('fireTube:') && a[id].choice === 'fire');
        const ready = () => {
            const d = display();
            (d.panels['tubes-status'] as { loading: number }[])[0].loading = 1;
            return d;
        };
        expect(fired(await answers(makeReferencePolicy(0.5), ready()))).toBe(true);
        let heads: Partial<typeof REFERENCE_HEADS> = { missile: 'hold' };
        setResidualWeaponsDecider(() => heads);
        const residual = makeResidualWeaponsPolicy(makeReferencePolicy(0.5));
        expect(fired(await answers(residual, ready()))).toBe(false);
        heads = {};
        expect(fired(await answers(residual, ready()))).toBe(true);
    });

    it('gun fire hold holds the trigger; missile hold locks every tube', async () => {
        setResidualWeaponsDecider(() => ({ gunFire: 'hold', missile: 'hold' }));
        const a = await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display());
        expect(a['fireChainGun:0']).toEqual({ choice: 'hold_fire', source: 'model' });
        expect(a['fireTube:0'].choice).toBe('hold_fire');
        expect(a['tubeSafety:0'].choice).toBe('on');
    });

    it('missile launch fires the first loaded tube when locked', async () => {
        setResidualWeaponsDecider(() => ({ missile: 'launch' }));
        const a = await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display());
        expect(a['tubeSafety:0'].choice).toBe('off');
        expect(a['fireTube:0'].choice).toBe('fire');
        expect(a['fireTube:1'].choice).toBe('hold_fire');
        setResidualWeaponsDecider(() => ({ missile: 'launch' }));
        const none = await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display(null));
        expect(none['fireTube:0'].choice).toBe('hold_fire');
    });

    it('gun ammo ap cycles to AP; he keeps HE', async () => {
        setResidualWeaponsDecider(() => ({ gunAmmo: 'ap' }));
        expect(
            (await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display()))['changeGunAmmo:0'].choice,
        ).toBe('press');
        setResidualWeaponsDecider(() => ({ gunAmmo: 'he' }));
        expect(
            (await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display()))['changeGunAmmo:0'].choice,
        ).toBe('wait');
    });

    it('tube ammo alt re-types an unloaded tube to AP, he leaves HE alone', async () => {
        setResidualWeaponsDecider(() => ({ tubeAmmo: 'alt' }));
        const a = await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display());
        expect(a['changeTubeAmmo:1'].choice).toBe('press');
        expect(a['changeTubeAmmo:0'].choice).toBe('wait');
        setResidualWeaponsDecider(() => ({ tubeAmmo: 'he' }));
        expect(
            (await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display()))['changeTubeAmmo:1'].choice,
        ).toBe('wait');
    });

    it('target heads cycle the lock until it holds the chosen ship', async () => {
        setResidualWeaponsDecider(() => ({ target: 'nearest' }));
        expect(
            (await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display('far')))['target'].choice,
        ).toBe('next');
        expect(
            (await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display('near')))['target'].choice,
        ).toBe('none');
        setResidualWeaponsDecider(() => ({ target: 'nearest_to_station' }));
        expect(
            (await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display('near')))['target'].choice,
        ).toBe('next');
        expect(
            (await answers(makeResidualWeaponsPolicy(makeReferencePolicy(0.5)), display('far')))['target'].choice,
        ).toBe('none');
    });
});
