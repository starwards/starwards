import {
    ChainGun,
    Faction,
    Order,
    PowerLevel,
    ShipDie,
    ShipManagerNpc,
    ShipManagerPc,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { MAX_SYSTEM_HEAT } from '../src/ship/heat-manager';
import { expect } from 'chai';

function createNpcShip(
    configName: keyof typeof shipConfigurations,
    id: string,
    die: ShipDie | MockDie = new MockDie(),
) {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = id;
    const state = makeShipState(id, shipConfigurations[configName]);
    state.isPlayerShip = false;
    const shipMgr = new ShipManagerNpc(shipObj, state, spaceMgr, die);
    spaceMgr.insert(shipObj);
    return { spaceMgr, shipObj, shipMgr };
}

function singleTick(shipMgr: ShipManagerNpc | ShipManagerPc, spaceMgr: SpaceManager, deltaSeconds = 0.05) {
    const id = { deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: deltaSeconds };
    shipMgr.update(id);
    spaceMgr.update(id);
}

describe('AI heat-management automation', () => {
    describe('proportional coolant allocation', () => {
        it('a hot system receives more coolant than a cold one on the same hull', () => {
            const { spaceMgr, shipMgr } = createNpcShip('glaive', 'npc-hot-cold');
            const [gunA, gunB] = shipMgr.state.chainGuns;
            gunA.heat = 80;
            gunB.heat = 10;

            for (const id of makeIterationsData(2, 80)) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }

            expect(gunA.coolantFactor).to.be.greaterThan(gunB.coolantFactor);
        });
    });

    describe('player ships', () => {
        it('never has coolantFactor written by automation', () => {
            const spaceMgr = new SpaceManager();
            const shipObj = new Spaceship();
            shipObj.id = 'pc-untouched';
            const state = makeShipState(shipObj.id, shipConfigurations.glaive);
            const shipMgr = new ShipManagerPc(shipObj, state, spaceMgr, new MockDie());
            spaceMgr.insert(shipObj);
            state.chainGuns[0].heat = 90;

            for (const id of makeIterationsData(2, 80)) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }

            expect(state.chainGuns[0].coolantFactor).to.equal(0);
        });

        it('never has power backed off or fire ceased by automation', () => {
            const spaceMgr = new SpaceManager();
            const shipObj = new Spaceship();
            shipObj.id = 'pc-untouched-2';
            const state = makeShipState(shipObj.id, shipConfigurations.glaive);
            const shipMgr = new ShipManagerPc(shipObj, state, spaceMgr, new MockDie());
            spaceMgr.insert(shipObj);
            const gun = state.chainGuns[0];
            gun.power = PowerLevel.MAX;
            gun.heat = MAX_SYSTEM_HEAT;
            gun.isFiring = true;

            singleTick(shipMgr, spaceMgr);

            expect(gun.power).to.equal(PowerLevel.MAX);
        });
    });

    describe('cadence gating', () => {
        it('does not reallocate coolant while the game is paused (deltaSeconds = 0)', () => {
            const { spaceMgr, shipMgr } = createNpcShip('glaive', 'npc-paused');
            shipMgr.state.chainGuns[0].heat = 90;

            for (let i = 0; i < 50; i++) {
                singleTick(shipMgr, spaceMgr, 0);
            }

            expect(shipMgr.state.chainGuns[0].coolantFactor).to.equal(0);
        });
    });

    describe('phase stagger', () => {
        it('two ships reallocate coolant on different ticks so they are not synchronized', () => {
            const { spaceMgr: spaceA, shipMgr: shipA } = createNpcShip('glaive', 'ship-alpha', new ShipDie(0));
            const { spaceMgr: spaceB, shipMgr: shipB } = createNpcShip('glaive', 'ship-beta', new ShipDie(0));
            shipA.state.chainGuns[0].heat = 80;
            shipB.state.chainGuns[0].heat = 80;

            let firstReallocTickA = -1;
            let firstReallocTickB = -1;
            let tickIndex = 0;
            for (const id of makeIterationsData(1, 100)) {
                shipA.update(id);
                spaceA.update(id);
                shipB.update(id);
                spaceB.update(id);
                tickIndex++;
                if (firstReallocTickA === -1 && shipA.state.chainGuns[0].coolantFactor > 0) {
                    firstReallocTickA = tickIndex;
                }
                if (firstReallocTickB === -1 && shipB.state.chainGuns[0].coolantFactor > 0) {
                    firstReallocTickB = tickIndex;
                }
            }

            expect(firstReallocTickA).to.be.greaterThan(0);
            expect(firstReallocTickB).to.be.greaterThan(0);
            expect(firstReallocTickA).to.not.equal(firstReallocTickB);
        });
    });

    describe('power backoff', () => {
        it('steps power down to a discrete PowerLevel on an overheating gun before it reaches ceasefire', () => {
            const { spaceMgr, shipMgr } = createNpcShip('demo-ship', 'npc-backoff');
            const gun = shipMgr.state.chainGuns[0];
            gun.heat = 75; // above backoff-engage, below ceasefire-engage

            singleTick(shipMgr, spaceMgr);

            // must land on a declared PowerLevel enum value — `power` is rendered by name in the
            // status UI (system-status.ts), so an arbitrary float shows as `undefined` there
            expect(gun.power).to.equal(PowerLevel.LOW);
        });

        it('restores full power once the gun has cooled below the release threshold (hysteresis)', () => {
            const { spaceMgr, shipMgr } = createNpcShip('demo-ship', 'npc-restore');
            const gun = shipMgr.state.chainGuns[0];
            gun.heat = 75;

            singleTick(shipMgr, spaceMgr);
            expect(gun.power).to.equal(PowerLevel.LOW);

            gun.heat = 45; // cooled, but still above the release threshold
            singleTick(shipMgr, spaceMgr);
            expect(gun.power, 'still latched above release threshold').to.equal(PowerLevel.LOW);

            gun.heat = 10; // below the release threshold
            singleTick(shipMgr, spaceMgr);
            expect(gun.power, 'latch released once cooled').to.equal(PowerLevel.NORMAL);
        });

        it('restores a MAX-pinned gun to MAX, not NORMAL, once it cools', () => {
            const { spaceMgr, shipMgr } = createNpcShip('demo-ship', 'npc-restore-max');
            const gun = shipMgr.state.chainGuns[0];
            gun.power = PowerLevel.MAX; // e.g. a GM deliberately overdrove this mount
            gun.heat = 75;

            singleTick(shipMgr, spaceMgr);
            expect(gun.power, 'backs off from MAX while hot').to.equal(PowerLevel.LOW);

            gun.heat = 10;
            singleTick(shipMgr, spaceMgr);
            expect(gun.power, 'restores the pre-backoff level (MAX), not a hardcoded NORMAL').to.equal(PowerLevel.MAX);
        });

        it('leaves a SHUTDOWN-pinned gun at SHUTDOWN even if it somehow heats up', () => {
            const { spaceMgr, shipMgr } = createNpcShip('demo-ship', 'npc-shutdown-stays-off');
            const gun = shipMgr.state.chainGuns[0];
            gun.power = PowerLevel.SHUTDOWN; // e.g. a GM deliberately powered this mount down
            gun.heat = 75; // residual heat from before it was shut down

            singleTick(shipMgr, spaceMgr);
            expect(gun.power, 'already at/below the backoff floor — nothing to back off').to.equal(PowerLevel.SHUTDOWN);

            gun.heat = 10;
            singleTick(shipMgr, spaceMgr);
            expect(gun.power, 'stays SHUTDOWN once cooled too').to.equal(PowerLevel.SHUTDOWN);
        });

        it('never touches power on a mount it has not itself backed off, even while hot below the engage threshold', () => {
            const { spaceMgr, shipMgr } = createNpcShip('demo-ship', 'npc-untouched-below-threshold');
            const gun = shipMgr.state.chainGuns[0];
            gun.power = PowerLevel.MAX; // e.g. a GM or scenario deliberately pinned this
            gun.heat = 0;

            for (let i = 0; i < 10; i++) {
                singleTick(shipMgr, spaceMgr);
            }

            expect(gun.power).to.equal(PowerLevel.MAX);
        });
    });

    describe('ceasefire hard stop', () => {
        it('forces isFiring off once heat crosses the ceasefire threshold', () => {
            const { spaceMgr, shipMgr } = createNpcShip('demo-ship', 'npc-ceasefire');
            const gun = shipMgr.state.chainGuns[0];
            gun.isFiring = true;
            gun.heat = 96;

            singleTick(shipMgr, spaceMgr);

            expect(gun.isFiring).to.equal(false);
        });

        it('keeps ceasefire latched until heat drops below the release threshold (hysteresis)', () => {
            const { spaceMgr, shipMgr } = createNpcShip('demo-ship', 'npc-hysteresis');
            const gun = shipMgr.state.chainGuns[0];
            gun.heat = 96;
            singleTick(shipMgr, spaceMgr);
            expect(gun.isFiring).to.equal(false);

            gun.heat = 80; // cooled, but still above the release threshold
            gun.isFiring = true;
            singleTick(shipMgr, spaceMgr);
            expect(gun.isFiring, 'still latched above release threshold').to.equal(false);

            gun.heat = 60; // below the release threshold
            gun.isFiring = true;
            singleTick(shipMgr, spaceMgr);
            expect(gun.isFiring, 'latch released once cooled').to.equal(true);
        });
    });

    describe('per-mount heat evaluation', () => {
        it('gates each mount independently — a hot mount does not silence a cool one', () => {
            const { spaceMgr, shipMgr } = createNpcShip('glaive', 'npc-multi-mount');
            const [hot, cool]: ChainGun[] = [...shipMgr.state.chainGuns];
            hot.heat = 96;
            hot.isFiring = true;
            cool.heat = 10;
            cool.isFiring = true;

            singleTick(shipMgr, spaceMgr);

            expect(hot.isFiring, 'hot mount ceasefires').to.equal(false);
            expect(cool.isFiring, 'cool mount keeps firing').to.equal(true);
        });
    });

    describe('sustained engagement', () => {
        /**
         * Coolant budget (vs the dragonfly-MK1's stock 6) for a hull whose cooling cannot keep up
         * with sustained fire on its own — the condition under which power backoff has to engage.
         */
        const STARVED_COOLANT = 3;

        function armorHealthSum(state: ReturnType<typeof makeShipState>) {
            let sum = 0;
            for (const plate of state.armor.armorPlates) {
                sum += plate.healthRatio;
            }
            return sum;
        }

        /**
         * dragonfly-MK1 vs large-station, 10 sim-minutes, full ATTACK order, same seed every call —
         * `heatManagementEnabled` toggles NPC heat management entirely via the escape hatch built
         * for exactly this A/B comparison (see `AutomationManager.setHeatManagementEnabled`).
         *
         * `totalCoolant` overrides the hull's coolant budget: at the stock dragonfly-MK1 figure,
         * proportional coolant reallocation alone holds the gun far below the backoff threshold, so
         * a starved hull is what exercises the second line of defence (see the coolant-starved case).
         */
        function runSustainedEngagement(heatManagementEnabled: boolean, totalCoolant?: number) {
            const spaceMgr = new SpaceManager();
            const die = new MockDie();
            die.expectedRoll = 1;

            const attacker = new Spaceship().init(
                'attacker',
                Vec2.make(XY.byLengthAndDirection(20_000, 0)),
                'dragonfly-MK1',
                Faction.Raiders,
            );
            const attackerState = makeShipState(attacker.id, shipConfigurations['dragonfly-MK1']);
            attackerState.isPlayerShip = false;
            if (totalCoolant !== undefined) {
                attackerState.design.totalCoolant = totalCoolant;
            }
            const attackerMgr = new ShipManagerNpc(attacker, attackerState, spaceMgr, die);
            attackerMgr.automationManager.setHeatManagementEnabled(heatManagementEnabled);

            const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
            const targetState = makeShipState(target.id, shipConfigurations['large-station']);
            const targetMgr = new ShipManagerNpc(target, targetState, spaceMgr, die);

            spaceMgr.insert(attacker);
            spaceMgr.insert(target);
            spaceMgr.forceFlushEntities();

            attackerMgr.state.order = Order.ATTACK;
            attackerMgr.state.orderTargetId = target.id;

            const gun = attackerMgr.state.chainGuns[0];
            const initialArmor = armorHealthSum(targetState);
            let totalTicks = 0;
            let ceasefireLatchedTicks = 0;
            let sawPowerBackoff = false;
            let maxHeat = 0;
            for (const id of makeIterationsData(600, 12000)) {
                attackerMgr.update(id);
                targetMgr.update(id);
                spaceMgr.update(id);
                totalTicks++;
                if (gun.power < PowerLevel.NORMAL) sawPowerBackoff = true;
                if (attackerMgr.automationManager.isCeasefireLatched(gun)) ceasefireLatchedTicks++;
                maxHeat = Math.max(maxHeat, gun.heat);
            }

            return {
                armorLost: initialArmor - armorHealthSum(targetState),
                sawPowerBackoff,
                ceasefireLatchedFraction: ceasefireLatchedTicks / totalTicks,
                gunEffectiveness: gun.effectiveness,
                maxHeat,
            };
        }

        it('backs off power under sustained fire and keeps ceasefire a rare backstop while still damaging the target', () => {
            // coolant-starved hull: reallocation alone cannot hold the line, so power backoff — the
            // second line of defence — is what keeps the mount off the ceasefire threshold.
            const result = runSustainedEngagement(true, STARVED_COOLANT);

            // the engagement still measurably damages the target
            expect(result.armorLost).to.be.greaterThan(0);
            // power backoff actually engages at some point during sustained fire
            expect(result.sawPowerBackoff, 'power backoff engaged during the engagement').to.equal(true);
            // the ceasefire hard-stop — measured on actual latch membership, not a heat-threshold
            // proxy — stays a rare backstop, not the primary throttle
            expect(result.ceasefireLatchedFraction).to.be.lessThan(0.05);
            // the gun never takes overheat damage past its own defenses
            expect(result.gunEffectiveness).to.be.greaterThan(0);
        });

        it('asserts the net sustained-DPS effect: same seeded scenario with and without the automation', () => {
            const withAutomation = runSustainedEngagement(true);
            const withoutAutomation = runSustainedEngagement(false);

            // eslint-disable-next-line no-console
            console.log(
                `[#2175 sustained-DPS baseline] armor plates lost over 600s — ` +
                    `withAutomation=${withAutomation.armorLost} withoutAutomation=${withoutAutomation.armorLost}, ` +
                    `maxHeat withAutomation=${withAutomation.maxHeat} withoutAutomation=${withoutAutomation.maxHeat}`,
            );

            // both runs still measurably damage the target — heat management does not neuter offense
            expect(withAutomation.armorLost, 'with automation').to.be.greaterThan(0);
            expect(withoutAutomation.armorLost, 'without automation (baseline)').to.be.greaterThan(0);
            // regression guard: backoff only ever throttles down from the unthrottled baseline, so
            // automation must never deal MORE damage than the baseline — catches e.g. a future change
            // that silently doubles NPC DPS. Pinned loosely (measured ~33.5 vs ~33.5) to survive minor
            // tuning: on a stock hull, coolant reallocation alone holds heat clear of the backoff
            // threshold, so automation costs no offense at all here.
            expect(withAutomation.armorLost, 'automation must not out-damage the unthrottled baseline').to.be.at.most(
                withoutAutomation.armorLost,
            );
            expect(withAutomation.armorLost).to.be.closeTo(33.5, 5);
            expect(withoutAutomation.armorLost).to.be.closeTo(33.5, 5);
            // the actual point of heat management: with it, heat never approaches the ceasefire
            // threshold; without it, the gun sits pegged at the overheat ceiling for the fight
            expect(withAutomation.maxHeat, 'heat management keeps heat well clear of the ceiling').to.be.lessThan(
                MAX_SYSTEM_HEAT * 0.9,
            );
            expect(withoutAutomation.maxHeat, 'unmanaged NPC heat pegs at the ceiling').to.equal(MAX_SYSTEM_HEAT);
        });
    });
});
