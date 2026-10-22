import { Projectile, ammoDesigns, isMissile } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';

/** How a GVTS missile ended. */
export type MissileOutcome = 'hit' | 'kill' | 'expired' | 'target-dead' | 'miss' | 'flying';

/** One GVTS missile, from launch to its end. The target's model is the harness's knowledge; the bots never see it. */
export type MissileLaunch = {
    at: number;
    missile: string;
    targetId: string | null;
    targetModel: string | null;
    /** GVTS-to-target distance at launch, m. */
    range: number | null;
    /** `range` over the missile's nominal reach (top speed times life). */
    envelopeFraction: number | null;
    /** Whether a GVTS gun fired at the target within `SHELLFIRE_WINDOW_SECONDS` before the launch. */
    underShellfire: boolean;
    /** Seconds the GVTS guns fired at the target before the launch. */
    shellfireSeconds: number;
    outcome: MissileOutcome;
    endedAt: number | null;
};

const SHELLFIRE_WINDOW_SECONDS = 3;
/** A missile that vanished this near its target hit it; HE blast radius is 350 m. */
const HIT_METERS = 400;
/** A hit whose target died within this many seconds killed it. */
const KILL_SECONDS = 3;
const EXPIRED_SECONDS = 0.5;

/** Logs every missile the GVTS launches; `tick` once per game tick. */
export function missileTelemetry() {
    const launches: MissileLaunch[] = [];
    const flying = new Map<string, { log: MissileLaunch; last: Projectile; lastTarget: { x: number; y: number } | null }>();
    const shellfire = new Map<string, { last: number; total: number }>();
    const diedAt = new Map<string, number>();
    let lastSeconds = 0;

    const liveShip = (game: HeadlessGame, id: string | null) => {
        const s = id ? game.spaceManager.state.getShip(id) : undefined;
        return s && !s.destroyed ? s : undefined;
    };

    return {
        tick(game: HeadlessGame) {
            const now = game.seconds;
            const dt = now - lastSeconds;
            lastSeconds = now;
            const me = game.spaceManager.state.getShip(TRAINING_PLAYER_ID);
            const myState = game.shipManagers.get(TRAINING_PLAYER_ID)?.state;
            const locked = myState?.weaponsTarget.targetId;
            if (locked && myState.chainGuns.some((g) => g.isFiring)) {
                const f = shellfire.get(locked) ?? { last: now, total: 0 };
                f.last = now;
                f.total += dt;
                shellfire.set(locked, f);
            }
            for (const ship of game.spaceManager.state.getAll('Spaceship'))
                if (ship.destroyed && !diedAt.has(ship.id)) diedAt.set(ship.id, now);
            const seen = new Set<string>();
            for (const p of game.spaceManager.state.getAll('Projectile')) {
                if (!isMissile(p) || p.shipId !== TRAINING_PLAYER_ID) continue;
                seen.add(p.id);
                const target = liveShip(game, p.targetId);
                let entry = flying.get(p.id);
                if (!entry) {
                    const range = target && me ? Math.hypot(target.position.x - me.position.x, target.position.y - me.position.y) : null;
                    const homing = ammoDesigns[p.model].homing;
                    const fire = p.targetId ? shellfire.get(p.targetId) : undefined;
                    const log: MissileLaunch = {
                        at: now,
                        missile: p.model,
                        targetId: p.targetId,
                        targetModel: target?.model ?? null,
                        range: range === null ? null : Math.round(range),
                        envelopeFraction:
                            range === null || !homing ? null : +(range / (homing.maxSpeed * homing.secondsToLive)).toFixed(4),
                        underShellfire: fire !== undefined && now - fire.last <= SHELLFIRE_WINDOW_SECONDS,
                        shellfireSeconds: +(fire?.total ?? 0).toFixed(1),
                        outcome: target ? 'flying' : 'target-dead',
                        endedAt: null,
                    };
                    launches.push(log);
                    entry = { log, last: p, lastTarget: null };
                    flying.set(p.id, entry);
                }
                entry.last = p;
                entry.lastTarget = target ? { x: target.position.x, y: target.position.y } : entry.lastTarget;
            }
            for (const [id, entry] of flying) {
                if (seen.has(id)) continue;
                flying.delete(id);
                const { log, last, lastTarget } = entry;
                log.endedAt = now;
                if (log.outcome === 'target-dead') continue;
                const targetDied = log.targetId !== null && diedAt.has(log.targetId) && diedAt.get(log.targetId)! < now - 1;
                if (targetDied) log.outcome = 'target-dead';
                else if (last.secondsToLive <= EXPIRED_SECONDS) log.outcome = 'expired';
                else if (
                    lastTarget &&
                    Math.hypot(lastTarget.x - last.position.x, lastTarget.y - last.position.y) <= HIT_METERS
                )
                    log.outcome = 'hit';
                else log.outcome = 'miss';
            }
        },
        report(): MissileLaunch[] {
            for (const log of launches) {
                const died = log.targetId === null ? undefined : diedAt.get(log.targetId);
                if (log.outcome === 'hit' && died !== undefined && log.endedAt !== null && died - log.endedAt <= KILL_SECONDS)
                    log.outcome = 'kill';
            }
            return launches;
        },
    };
}
