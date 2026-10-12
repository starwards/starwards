import { HeadlessGame, SERVER_TICK_HZ } from '@starwards/server/src/test/headless-game';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT1Map } from '@starwards/server/src/scenarios/training';

import { HeadlessRecorder } from '@starwards/server/src/test/headless-recorder';
import { Policy } from '../brain/brain';
import { brainSpecSchema } from '../brain/spec';
import { headlessCrew } from './crew';
import { makeReferencePolicy } from '../brain/reference-policy';

const weaponsBrain = brainSpecSchema.parse({
    id: 'weapons',
    version: 1,
    station: 'weapons',
    model: 'none',
    decisionSeconds: 1,
    role: 'weapons',
    mission: 'test',
});

type TubePanel = { index: number; loadedProjectile: string; loading: number }[];

/** Releases every loaded tube's safety and pulls its trigger; leaves every other control alone. */
const triggerHappy: Policy = {
    name: 'trigger-happy',
    answer(_request, controls, shown) {
        const tubes = (shown as { panels: Record<string, unknown> }).panels['tubes-status'] as TubePanel;
        const ready = (id: string) => {
            const tube = tubes.find((t) => t.index === Number(id.split(':')[1]));
            return !!tube && tube.loading >= 1 && tube.loadedProjectile !== 'None';
        };
        const answers = Object.fromEntries(
            controls.map((c) => {
                const choice =
                    c.command === 'tubeSafety' && ready(c.id)
                        ? 'off'
                        : c.command === 'fireTube' && ready(c.id)
                          ? 'fire'
                          : c.rest;
                return [c.id, { choice, source: 'rule' as const }];
            }),
        );
        return Promise.resolve({ answers });
    },
};

const recorder = { record: () => undefined } as unknown as HeadlessRecorder;

async function missilesLaunched(policy: Policy, lock: boolean) {
    const game = HeadlessGame.start(createTrainingT1Map({ distance: 4000, bearing: 0 }), 1, { crewedPlayer: true });
    const ship = game.shipManagers.get(TRAINING_PLAYER_ID)!.state;
    ship.tubes.forEach((t) => (t.power = 0.5));
    if (lock) {
        ship.weaponsTarget.targetId = TRAINING_TARGET_ID;
    }
    const crew = headlessCrew({
        shipId: TRAINING_PLAYER_ID,
        latencySeconds: 0,
        seats: [{ station: 'weapons', spec: weaponsBrain, policy }],
    });
    const missiles = () =>
        [...game.spaceManager.state.getAll('Projectile')].filter(
            (p) => p.shipId === TRAINING_PLAYER_ID && p.design.homing,
        );
    for (let i = 0; i < 30 * SERVER_TICK_HZ && !missiles().length; i++) {
        await crew.beforeTick(game, recorder);
        game.tick(1 / SERVER_TICK_HZ);
    }
    return { missiles: missiles(), ship };
}

describe('tubes through the weapons console', () => {
    jest.setTimeout(60_000);

    it('a brain releases a loaded tube safety and fires it', async () => {
        const { missiles } = await missilesLaunched(triggerHappy, false);
        expect(missiles.length).toBeGreaterThan(0);
    });

    it('the reference weapons fires a tube at the locked target', async () => {
        const { missiles } = await missilesLaunched(makeReferencePolicy(1), true);
        expect(missiles.length).toBeGreaterThan(0);
        expect(missiles[0].targetId).toBe(TRAINING_TARGET_ID);
    });
});
