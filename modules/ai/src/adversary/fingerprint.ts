import { Damage, Faction, ShipState, Spaceship, XY } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { tapDamage } from '@starwards/server/src/test/damage-tap';

/** Upper edges (metres) of the range histogram bins; a raider's range is to what it is engaging. */
export const RANGE_BIN_EDGES = [500, 1000, 2000, 3000, 5000, 8000, 15_000, 50_000, Infinity] as const;

/** What one raider did over the part of a run it was alive: behaviour, not outcome. */
export interface RaiderFingerprint {
    readonly id: string;
    /** Sim-seconds the raider was alive and had something to range against. */
    readonly seconds: number;
    /** Sim-seconds spent in each {@link RANGE_BIN_EDGES} bin. */
    readonly rangeSeconds: readonly number[];
    /** Changes of engagement target between two non-empty targets (aggro-held attacker, else order target). */
    readonly attentionSwitches: number;
    /** Weapon hits this raider landed on ships of another faction. */
    readonly hits: number;
    /** Of {@link hits}, those that landed on a hull section holding an already-broken armor plate. */
    readonly hitsOnBrokenPlates: number;
    /** Sim-seconds with at least one chain gun firing. */
    readonly fireSeconds: number;
    /** Time-integral of speed (metres), so the mean speed is this over {@link seconds}. */
    readonly distanceFlown: number;
}

interface Accumulator {
    seconds: number;
    rangeSeconds: number[];
    attentionSwitches: number;
    hits: number;
    hitsOnBrokenPlates: number;
    fireSeconds: number;
    distanceFlown: number;
    attention: string;
}

function binOf(range: number): number {
    return RANGE_BIN_EDGES.findIndex((edge) => range < edge);
}

/** Whether any plate under the hit's surface arc was already fully broken, as `AttackResolutionManager` decides `breachHit`. */
function hitsBrokenPlate(state: ShipState, arc: Damage['damageSurfaceArc']): boolean {
    for (const [plate] of state.armor.plateHitOverlaps(arc)) {
        if (plate.broken) {
            return true;
        }
    }
    return false;
}

/**
 * Watches every raider of a headless run and fingerprints its behaviour (M4.65, S0 of the NPC AI
 * design). Read-only: it samples the true state before each tick and taps the damage the ships drain,
 * so a run with the probe plays exactly as without it. Pass {@link FingerprintProbe.script} as the
 * run's `script`.
 *
 * Limits: the engagement target is the one the state exposes (`aggroTargetId`, else `orderTargetId`);
 * the opportunity target `AutomationManager` picks privately for a raider with no order is not
 * visible, so a raider on no order shows no attention and ranges against the nearest hostile ship.
 */
export class FingerprintProbe {
    private readonly raiders = new Map<string, Accumulator>();
    private installed = false;
    private lastSeconds = 0;

    /** The tick hook: call before every `game.tick`. */
    readonly script = (game: HeadlessGame): void => {
        if (!this.installed) {
            this.installed = true;
            tapDamage(game, (targetId, damage) => this.onDamage(game, targetId, damage));
        }
        const dt = game.seconds - this.lastSeconds;
        this.lastSeconds = game.seconds;
        if (dt <= 0) {
            return;
        }
        for (const [id, manager] of game.shipManagers) {
            if (manager.state.faction !== Faction.Raiders) {
                continue;
            }
            const raider = game.spaceManager.state.get(id);
            if (!raider || raider.destroyed || !Spaceship.isInstance(raider)) {
                continue;
            }
            this.sample(game, raider, manager.state, dt);
        }
    };

    private accumulator(id: string): Accumulator {
        let acc = this.raiders.get(id);
        if (!acc) {
            acc = {
                seconds: 0,
                rangeSeconds: RANGE_BIN_EDGES.map(() => 0),
                attentionSwitches: 0,
                hits: 0,
                hitsOnBrokenPlates: 0,
                fireSeconds: 0,
                distanceFlown: 0,
                attention: '',
            };
            this.raiders.set(id, acc);
        }
        return acc;
    }

    private sample(game: HeadlessGame, raider: Spaceship, state: ShipState, dt: number) {
        const acc = this.accumulator(raider.id);
        const attentionId = state.aggroTargetId || state.orderTargetId || '';
        if (attentionId && acc.attention && attentionId !== acc.attention) {
            acc.attentionSwitches++;
        }
        if (attentionId) {
            acc.attention = attentionId;
        }
        const range = this.rangeToEngaged(game, raider, attentionId);
        if (range === undefined) {
            return;
        }
        acc.seconds += dt;
        acc.rangeSeconds[binOf(range)] += dt;
        acc.distanceFlown += XY.lengthOf(raider.velocity) * dt;
        if (state.chainGuns.some((gun) => gun.isFiring)) {
            acc.fireSeconds += dt;
        }
    }

    /** Distance to the engagement target while it lives, else to the nearest live ship of another faction. */
    private rangeToEngaged(game: HeadlessGame, raider: Spaceship, attentionId: string): number | undefined {
        const engaged = attentionId ? game.spaceManager.state.get(attentionId) : undefined;
        if (engaged && !engaged.destroyed) {
            return XY.distance(engaged.position, raider.position);
        }
        let nearest: number | undefined;
        for (const other of game.spaceManager.state.getAll('Spaceship')) {
            if (other.destroyed || other.faction === raider.faction || other.faction === Faction.NONE) {
                continue;
            }
            const distance = XY.distance(other.position, raider.position);
            nearest = nearest === undefined ? distance : Math.min(nearest, distance);
        }
        return nearest;
    }

    private onDamage(game: HeadlessGame, targetId: string, damage: Damage) {
        const target = game.shipManagers.get(targetId);
        const shooterState = game.shipManagers.get(damage.shipId)?.state;
        if (
            !shooterState ||
            shooterState.faction !== Faction.Raiders ||
            !target ||
            target.state.faction === Faction.Raiders ||
            damage.damageType === 'Collision'
        ) {
            return;
        }
        const acc = this.accumulator(damage.shipId);
        acc.hits++;
        if (hitsBrokenPlate(target.state, damage.damageSurfaceArc)) {
            acc.hitsOnBrokenPlates++;
        }
    }

    /** One fingerprint per raider seen, in the order they first appeared. */
    result(): RaiderFingerprint[] {
        return [...this.raiders].map(([id, acc]) => ({
            id,
            seconds: acc.seconds,
            rangeSeconds: acc.rangeSeconds,
            attentionSwitches: acc.attentionSwitches,
            hits: acc.hits,
            hitsOnBrokenPlates: acc.hitsOnBrokenPlates,
            fireSeconds: acc.fireSeconds,
            distanceFlown: acc.distanceFlown,
        }));
    }
}

/** A set of raiders pooled: the unit baselines and doctrine comparisons use. */
export interface PooledFingerprint {
    readonly raiders: number;
    readonly seconds: number;
    /** Share of raider-time in each {@link RANGE_BIN_EDGES} bin. */
    readonly rangeShare: readonly number[];
    readonly meanSpeed: number;
    readonly fireDuty: number;
    readonly attentionSwitchesPerMinute: number;
    readonly hits: number;
    /** Hits on already-broken plates over all hits; null when there were none. */
    readonly brokenPlateShare: number | null;
}

export function poolFingerprints(fingerprints: readonly RaiderFingerprint[]): PooledFingerprint {
    const sum = (f: (r: RaiderFingerprint) => number) => fingerprints.reduce((total, r) => total + f(r), 0);
    const seconds = sum((r) => r.seconds);
    const hits = sum((r) => r.hits);
    return {
        raiders: fingerprints.length,
        seconds,
        rangeShare: RANGE_BIN_EDGES.map((_, bin) => (seconds ? sum((r) => r.rangeSeconds[bin]) / seconds : 0)),
        meanSpeed: seconds ? sum((r) => r.distanceFlown) / seconds : 0,
        fireDuty: seconds ? sum((r) => r.fireSeconds) / seconds : 0,
        attentionSwitchesPerMinute: seconds ? (sum((r) => r.attentionSwitches) / seconds) * 60 : 0,
        hits,
        brokenPlateShare: hits ? sum((r) => r.hitsOnBrokenPlates) / hits : null,
    };
}

/** Total variation distance between two range histograms: 0 identical, 1 disjoint. */
export function rangeSeparation(a: PooledFingerprint, b: PooledFingerprint): number {
    return a.rangeShare.reduce((total, share, bin) => total + Math.abs(share - b.rangeShare[bin]), 0) / 2;
}
