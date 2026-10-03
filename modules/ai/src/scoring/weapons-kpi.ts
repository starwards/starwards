import {
    AmmoType,
    PowerLevel,
    RecordingEventLine,
    SavedGame,
    ShipState,
    WeaponDamageType,
    ammoDesigns,
    blastRadius,
    damageProfiles,
    isShellAmmo,
    shellAmmoTypes,
} from '@starwards/core/internal';

/**
 * The tactical (helms + weapons) and weapons station scores, read from a recording: 1 s `SavedGame`
 * frames and the sidecar's `shot`, `damage` and `projectile_end` events. Ground truth only.
 *
 * Incapacitation of a ship, in [0, 1], values damage by what it does to the ship's threat, not by
 * raw integrity: `I = 1 − (1 − kill)·cap`, kill progress `kill = ½·(armor lost) + ½·(capsule lost)`
 * (1 once destroyed), capability `cap = gun·(½ + ½·mobility)`. Frag or Elec system damage that
 * slows the enemy's gun raises I as surely as plate damage does.
 *
 * Threat of enemy j: `θ_j = dps_j · P_reach(j, us) · ammoFrac_j · cap_j`, normalised over the
 * living enemies (uniform when all are 0), and time-averaged over a window.
 *
 * Credit over a window W: `C = Σ_j θ̃_j · Σ_k (1 + φ·[j held as our target ≥ 5 s]) · ΔI_j(k)⁺ · ours_j(k)
 * − λ_ff · Σ_friendly ΔI⁺·ours`, where `ours_j(k)` is our share of the recorded hits j took between
 * frames k and k+1 (0 when it took none: unattributed loss is nobody's credit). `C_max = (1+φ)·Σ_j θ̃_j
 * · min(1 − I_j(start), ρ·gun_ours·W)`, ρ the fastest incapacitation rate a full-strength gun reaches.
 * Tactical `T = C / C_max`. Opportunity `O` = threat-weighted share of the window's frames in which a
 * ground-truth firing solution existed (credited to helms); conversion `V = T / O` (to weapons), so
 * `log T = log O + log V`. A crew that never fires has `V = 0` wherever `O > 0`.
 */
export interface TacticalWeights {
    /** Bonus on damage to the target held ≥ {@link HELD_SECONDS}: an owner value judgement. */
    readonly phi: number;
    readonly lambdaFriendly: number;
    readonly windowSeconds: number;
    /** Fastest incapacitation per second a full-strength gun reaches (fitted on reference runs). */
    readonly rho: number;
}

export const TACTICAL_WEIGHTS: TacticalWeights = { phi: 1, lambdaFriendly: 2, windowSeconds: 45, rho: 0.01 };
const HELD_SECONDS = 5;

/** Weapons station `K_w = 1 − w1·nosol − w2·dominated − w3·friendly + w4·lockUptime`, rates per round. */
export const WEAPONS_WEIGHTS = { nosol: 1, dominated: 1, friendly: 2, lock: 0.5 } as const;
/** A round is dominated when its analytic value is below this share of the best ammo in the magazine. */
const DOMINATED_SHARE = 0.5;

/** One ship of a frame, as the scores read it. */
export interface ShipReading {
    readonly id: string;
    readonly faction: number;
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly radius: number;
    readonly destroyed: boolean;
    readonly incapacitation: number;
    readonly threat: number;
    /** Armor health in hand and in total, for the ammo value of a round. */
    readonly plateHealth: number;
    readonly plateHealthMax: number;
    /** Outermost living armor layer's plate damage multiplier per damage type. */
    readonly plateDamage: Record<WeaponDamageType, number>;
    readonly penetration: Record<WeaponDamageType, number>;
    readonly capsuleDamage50: number;
    readonly internals: number;
    readonly externals: number;
}

/** The player's weapons, as one frame shows them. */
export interface OwnWeapons {
    readonly gun: number;
    readonly gunBearing: number;
    readonly bulletSpeed: number;
    readonly fuzeSeconds: number;
    readonly gunAmmo: AmmoType | 'None';
    readonly shellsInMagazine: readonly AmmoType[];
    readonly targetId: string | null;
    readonly tubesReady: boolean;
}

export interface TacticalFrame {
    readonly t: number;
    readonly own: ShipReading;
    readonly weapons: OwnWeapons;
    readonly enemies: readonly ShipReading[];
    readonly friends: readonly ShipReading[];
}

const shipNormal = (power: number, hacked: number, broken: boolean) =>
    broken ? 0 : Math.min(1, power / PowerLevel.NORMAL) * hacked;

function gunCapability(ship: ShipState) {
    const guns = [...ship.chainGuns];
    if (!guns.length) return 0;
    return guns.reduce((s, g) => s + shipNormal(g.power, g.hacked, g.broken) * g.rateOfFireFactor, 0) / guns.length;
}

function mobility(ship: ShipState) {
    const ts = [...ship.thrusters];
    if (!ts.length) return 0;
    return ts.reduce((s, t) => s + shipNormal(t.power, t.hacked, t.broken) * t.availableCapacity, 0) / ts.length;
}

function armorHealth(ship: ShipState) {
    let health = 0;
    let max = 0;
    for (const plate of ship.armor.armorPlates) {
        for (const layer of plate.layers) {
            health += layer.health;
            max += layer.maxHealth;
        }
    }
    return { health, max };
}

/** Rounds per second times the damage of a round, over the ship's guns at full strength. */
function nominalDps(ship: ShipState) {
    let dps = 0;
    for (const g of ship.chainGuns) {
        const ammo = g.projectile === 'None' ? 'HiExpShell' : g.projectile;
        dps += g.design.bulletsPerSecond * roundAmount(ammo);
    }
    return dps;
}

function roundAmount(ammo: AmmoType) {
    const d = ammoDesigns[ammo];
    return d.delivery === 'impact' ? d.damage : d.explosion.damageFactor;
}

function shellFraction(ship: ShipState) {
    const m = ship.magazine;
    let count = 0;
    let max = 0;
    for (const a of shellAmmoTypes) {
        count += m.getCount(a);
        max += (m.design as unknown as Record<string, number>)[`max_${a}`] ?? 0;
    }
    return max > 0 ? Math.min(1, count / max) : 0;
}

/** Beyond its guns' range, a ship's chance to reach us decays over one more range. */
function reach(distance: number, range: number) {
    return distance <= range ? 1 : Math.exp(-(distance - range) / Math.max(range, 1));
}

function readShip(saved: SavedGame, id: string, versus?: { x: number; y: number }): ShipReading | undefined {
    const ship = saved.fragment.ship.get(id);
    const body = saved.fragment.space.getShip(id);
    if (!ship || !body) return undefined;
    const armor = armorHealth(ship);
    const capsule = Math.max(0, ship.capsule.integrity);
    const kill = body.destroyed ? 1 : 0.5 * (armor.max > 0 ? 1 - armor.health / armor.max : 0) + 0.5 * (1 - capsule);
    const cap = gunCapability(ship) * (0.5 + 0.5 * mobility(ship));
    const range = Math.max(0, ...[...ship.chainGuns].map((g) => g.design.maxShellRange));
    const distance = versus ? Math.hypot(body.position.x - versus.x, body.position.y - versus.y) : 0;
    const outer = [...ship.armor.armorPlates].flatMap((p) => [...p.layers]).find((l) => l.health > 0)?.design;
    const plateDamage = {} as Record<WeaponDamageType, number>;
    const penetration = {} as Record<WeaponDamageType, number>;
    for (const t of Object.keys(damageProfiles) as WeaponDamageType[]) {
        plateDamage[t] = outer ? Number((outer as unknown as Record<string, number>)[`plateDamage_${t}`]) : 0;
        penetration[t] = outer ? Number((outer as unknown as Record<string, number>)[`penetration_${t}`]) : 1;
    }
    const systems = ship.systems();
    return {
        id,
        faction: Number(body.faction),
        x: body.position.x,
        y: body.position.y,
        vx: body.velocity.x,
        vy: body.velocity.y,
        radius: body.radius,
        destroyed: body.destroyed,
        incapacitation: body.destroyed ? 1 : 1 - (1 - kill) * cap,
        threat: body.destroyed ? 0 : nominalDps(ship) * reach(distance, range) * shellFraction(ship) * cap,
        plateHealth: armor.health,
        plateHealthMax: armor.max,
        plateDamage,
        penetration,
        capsuleDamage50: ship.capsule.design.damage50,
        internals: systems.filter((s) => s.design.isInternal).length,
        externals: systems.filter((s) => !s.design.isInternal).length,
    };
}

/** Reads one frame for the player `playerId`; `undefined` when it is gone. */
export function observeTactical(t: number, saved: SavedGame, playerId: string): TacticalFrame | undefined {
    const own = readShip(saved, playerId);
    const ship = saved.fragment.ship.get(playerId);
    if (!own || own.destroyed || !ship) return undefined;
    const others = [...saved.fragment.ship.keys()]
        .filter((id) => id !== playerId)
        .flatMap((id) => readShip(saved, id, own) ?? []);
    const gun = ship.chainGuns.at(0);
    return {
        t,
        own,
        enemies: others.filter((s) => s.faction !== own.faction),
        friends: others.filter((s) => s.faction === own.faction),
        weapons: {
            gun: gunCapability(ship),
            gunBearing: gun ? gun.getGlobalBearing(ship) : 0,
            bulletSpeed: gun?.design.bulletSpeed ?? 0,
            fuzeSeconds: gun ? gun.shellSecondsToLive || gun.design.maxShellRange / gun.design.bulletSpeed : 0,
            gunAmmo: gun?.projectile ?? 'None',
            shellsInMagazine: shellAmmoTypes.filter(
                (a) => ship.magazine.getCount(a) > 0 && gun?.design[`use_${a}`] === true,
            ),
            targetId: ship.weaponsTarget.targetId,
            tubesReady:
                [...ship.tubes].some((tube) => shipNormal(tube.power, tube.hacked, tube.broken) > 0) &&
                ['HiExpMissile', 'ArmPenMissile', 'FragMissile', 'ClusterMissile', 'TandemMissile', 'ElecMissile'].some(
                    (a) => ship.magazine.getCount(a as AmmoType) > 0,
                ),
        },
    };
}

type XYV = { x: number; y: number; vx: number; vy: number };

/**
 * Whether an unguided round from `shell` (position and velocity), fuzed to `fuzeSeconds`, passes
 * within its fuze and blast reach of `target` (moving straight) while closing on it.
 */
export function shellReaches(shell: XYV, fuzeSeconds: number, ammo: AmmoType, target: XYV & { radius: number }) {
    const rx = target.x - shell.x;
    const ry = target.y - shell.y;
    const vx = shell.vx - target.vx;
    const vy = shell.vy - target.vy;
    const closing = rx * vx + ry * vy;
    if (closing <= 0) return false;
    const tStar = Math.min(fuzeSeconds, closing / (vx * vx + vy * vy));
    const miss = Math.hypot(rx - vx * tStar, ry - vy * tStar);
    const design = ammoDesigns[ammo];
    const fuze = design.fuze.type === 'proximity' ? design.fuze.range : 0;
    return miss <= fuze + blastRadius(ammo) + target.radius;
}

const MISSILE_BAND: readonly [number, number] = [1000, 20_000];

/** Whether the player had a firing solution on `enemy` in this frame: gun, or a missile in band on the held target. */
export function hasSolution(frame: TacticalFrame, enemy: ShipReading) {
    const { own, weapons } = frame;
    if (enemy.destroyed) return false;
    const ammo = weapons.gunAmmo !== 'None' ? weapons.gunAmmo : weapons.shellsInMagazine[0];
    if (weapons.gun > 0 && ammo && isShellAmmo(ammo)) {
        const rad = (weapons.gunBearing * Math.PI) / 180;
        const shell = {
            x: own.x,
            y: own.y,
            vx: own.vx + weapons.bulletSpeed * Math.cos(rad),
            vy: own.vy + weapons.bulletSpeed * Math.sin(rad),
        };
        if (shellReaches(shell, weapons.fuzeSeconds, ammo, enemy)) return true;
    }
    const d = Math.hypot(enemy.x - own.x, enemy.y - own.y);
    return weapons.tubesReady && weapons.targetId === enemy.id && d >= MISSILE_BAND[0] && d <= MISSILE_BAND[1];
}

/** Living enemies' threat shares, uniform when none threatens. */
export function threatShares(enemies: readonly ShipReading[]): Map<string, number> {
    const alive = enemies.filter((e) => !e.destroyed);
    const total = alive.reduce((s, e) => s + e.threat, 0);
    return new Map(alive.map((e) => [e.id, total > 0 ? e.threat / total : 1 / alive.length]));
}

/**
 * Analytic value of one round of `ammo` against `target`'s armor in its current state, in
 * incapacitation: plate erosion toward a kill (a blast touches two plates, an impact one), capsule
 * defects behind broken or penetrated plates (a blast reaches half the hull's systems, a single-system round one), and surface scrapes on external systems toward
 * disarming. Reactive armor is out of scope (#1970). INFERENCE in its constants: they read the rules
 * in `armor-models.ts`, `damage-profile.ts` and the defect roll, not measured hit rates.
 */
export function ammoValue(ammo: AmmoType, target: ShipReading) {
    const design = ammoDesigns[ammo];
    const type = design.damageType;
    const profile = damageProfiles[type];
    const amount = roundAmount(ammo);
    const broken = target.plateHealthMax > 0 ? 1 - target.plateHealth / target.plateHealthMax : 1;
    const plates = design.delivery === 'explosion' ? 2 : 1;
    const plate = (0.5 * amount * plates * target.plateDamage[type]) / Math.max(target.plateHealthMax, 1);
    const exposed = broken + (1 - broken) * target.penetration[type];
    // a single-system round picks one internal system; a blast reaches every system in its area (half the hull)
    const capsuleOdds = profile.systemScope === 'single' ? 1 / Math.max(target.internals, 1) : 0.5;
    const capsuleDefects = profile.hitsInternal
        ? ((exposed * amount * profile.systemDamageFactor) / (2 * target.capsuleDamage50)) * capsuleOdds
        : 0;
    const surface = (profile.surfaceDamageFactor * 0.05 * amount * target.externals) / (2 * 20);
    // a capsule defect is a tenth of the capsule (half of kill progress); a random external defect costs
    // about 0.01 of capability (the gun is one external system in nine, a defect takes 5-10% off it)
    return plate + 0.5 * 0.1 * capsuleDefects + 0.01 * surface;
}

export function isDominated(ammo: AmmoType, available: readonly AmmoType[], target: ShipReading) {
    const best = Math.max(ammoValue(ammo, target), ...available.map((a) => ammoValue(a, target)));
    return ammoValue(ammo, target) < DOMINATED_SHARE * best;
}

interface Shot {
    readonly t: number;
    readonly id: string;
    readonly ammo: AmmoType;
    readonly targetId: string | null;
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly ttl: number;
}

interface Hit {
    readonly t: number;
    readonly victim: string;
    readonly shooterId: string;
    readonly weight: number;
}

function shotsOf(events: readonly RecordingEventLine[], playerId: string): Shot[] {
    return events.flatMap((e) => {
        const d = e.data as Omit<Shot, 't' | 'id'> & { shipId: string };
        return e.kind === 'shot' && d.shipId === playerId ? [{ ...d, t: e.t, id: e.objectId ?? '' }] : [];
    });
}

function hitsOf(events: readonly RecordingEventLine[], frames: readonly TacticalFrame[]): Hit[] {
    const plateMax = new Map<string, number>();
    for (const f of frames.slice(0, 1))
        for (const s of [...f.enemies, ...f.friends]) plateMax.set(s.id, s.plateHealthMax);
    return events.flatMap((e) => {
        if (e.kind !== 'damage') return [];
        const d = e.data as { shooterId: string; plateLoss: number; defects: number };
        const max = plateMax.get(e.objectId ?? '') || 1;
        return [
            {
                t: e.t,
                victim: e.objectId ?? '',
                shooterId: d.shooterId,
                weight: d.plateLoss / max + 0.1 * d.defects + 1e-6,
            },
        ];
    });
}

/** Frame index at or before `t`. */
function frameAt(frames: readonly TacticalFrame[], t: number) {
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (frames[mid].t <= t) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

export interface WeaponsRates {
    readonly rounds: number;
    readonly nosol: number;
    readonly dominated: number;
    readonly friendly: number;
    readonly lockUptime: number;
    readonly kw: number;
}

/** The weapons station score over a run's frames and events. */
export function weaponsScore(
    frames: readonly TacticalFrame[],
    events: readonly RecordingEventLine[],
    playerId: string,
): WeaponsRates {
    const shots = shotsOf(events, playerId);
    let nosol = 0;
    let dominated = 0;
    let rated = 0;
    for (const s of shots) {
        if (!frames.length) break;
        const f = frames[frameAt(frames, s.t)];
        const dt = s.t - f.t;
        const alive = f.enemies.filter((e) => !e.destroyed);
        const target =
            alive.find((e) => e.id === s.targetId) ??
            alive.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
        if (!target) continue;
        rated++;
        const at = { ...target, x: target.x + target.vx * dt, y: target.y + target.vy * dt };
        if (isShellAmmo(s.ammo)) {
            if (!shellReaches(s, s.ttl, s.ammo, at)) nosol++;
            if (isDominated(s.ammo, f.weapons.shellsInMagazine, target)) dominated++;
        } else {
            const d = Math.hypot(at.x - s.x, at.y - s.y);
            if (s.targetId !== target.id || d < MISSILE_BAND[0] || d > MISSILE_BAND[1]) nosol++;
        }
    }
    const hits = hitsOf(events, frames).filter((h) => h.shooterId === playerId);
    const friends = new Set(frames.flatMap((f) => f.friends.map((s) => s.id)));
    const total = hits.reduce((s, h) => s + h.weight, 0);
    const friendly =
        total > 0 ? hits.filter((h) => friends.has(h.victim)).reduce((s, h) => s + h.weight, 0) / total : 0;
    const fighting = frames.filter((f) => f.enemies.some((e) => !e.destroyed));
    const locked = fighting.filter((f) => f.enemies.some((e) => !e.destroyed && e.id === f.weapons.targetId)).length;
    const lockUptime = fighting.length ? locked / fighting.length : 0;
    const rate = (n: number) => (rated ? n / rated : 0);
    const w = WEAPONS_WEIGHTS;
    return {
        rounds: shots.length,
        nosol: rate(nosol),
        dominated: rate(dominated),
        friendly,
        lockUptime,
        kw: 1 - w.nosol * rate(nosol) - w.dominated * rate(dominated) - w.friendly * friendly + w.lock * lockUptime,
    };
}

export interface TacticalWindow {
    readonly t: number;
    /** Credit, its ceiling, and their ratio T; null when nothing was left to take. */
    readonly c: number;
    readonly cMax: number;
    readonly T: number | null;
    readonly O: number;
    /** Our gun's mean capability over the window (the engineer covariate). */
    readonly gun: number;
    /** Incapacitation the enemies took in the window, whoever dealt it (the persistence baseline's input). */
    readonly dI: number;
    /** Whether an enemy alive at the window's start died within 60 s of it. */
    readonly kill60: boolean;
    /** Whether the nearest enemy started the window beyond our gun's range. */
    readonly outranged: boolean;
}

/** Our share of the hits `victim` took in (t0, t1]; 0 when it took none. */
function oursShare(hits: readonly Hit[], victim: string, t0: number, t1: number, playerId: string) {
    let ours = 0;
    let all = 0;
    for (const h of hits) {
        if (h.victim !== victim || h.t <= t0 || h.t > t1) continue;
        all += h.weight;
        if (h.shooterId === playerId) ours += h.weight;
    }
    return all > 0 ? ours / all : 0;
}

/** Consecutive windows over a run while an enemy is alive at the window's start. */
export function tacticalWindows(
    frames: readonly TacticalFrame[],
    events: readonly RecordingEventLine[],
    playerId: string,
    w: TacticalWeights = TACTICAL_WEIGHTS,
    gunRange = 8000,
): TacticalWindow[] {
    const hits = hitsOf(events, frames);
    const heldSince = new Map<number, number>();
    let since = 0;
    frames.forEach((f, k) => {
        if (k === 0 || f.weapons.targetId !== frames[k - 1].weapons.targetId) since = f.t;
        heldSince.set(k, since);
    });
    const windows: TacticalWindow[] = [];
    let start = 0;
    while (start < frames.length - 1) {
        const f0 = frames[start];
        const alive = f0.enemies.filter((e) => !e.destroyed);
        if (!alive.length) break;
        const end = frames.findIndex((f) => f.t >= f0.t + w.windowSeconds);
        const last = end < 0 ? frames.length - 1 : end;
        if (frames[last].t - f0.t < w.windowSeconds / 2) break;
        const shares = new Map<string, number>();
        let O = 0;
        let gun = 0;
        for (let k = start; k < last; k++) {
            const s = threatShares(frames[k].enemies);
            for (const [id, v] of s) shares.set(id, (shares.get(id) ?? 0) + v / (last - start));
            for (const e of frames[k].enemies) if (hasSolution(frames[k], e)) O += (s.get(e.id) ?? 0) / (last - start);
            gun += frames[k].weapons.gun / (last - start);
        }
        let c = 0;
        let cMax = 0;
        let dI = 0;
        const iAt = (k: number, id: string) =>
            frames[k].enemies.find((e) => e.id === id)?.incapacitation ??
            frames[k].friends.find((e) => e.id === id)?.incapacitation ??
            1;
        for (const e of alive) {
            const theta = shares.get(e.id) ?? 0;
            cMax += (1 + w.phi) * theta * Math.min(1 - e.incapacitation, w.rho * gun * w.windowSeconds);
            for (let k = start; k < last; k++) {
                const gain = Math.max(0, iAt(k + 1, e.id) - iAt(k, e.id));
                dI += gain;
                const held = frames[k].weapons.targetId === e.id && frames[k].t - heldSince.get(k)! >= HELD_SECONDS;
                c +=
                    theta *
                    (1 + (held ? w.phi : 0)) *
                    gain *
                    oursShare(hits, e.id, frames[k].t, frames[k + 1].t, playerId);
            }
        }
        for (const fr of f0.friends) {
            for (let k = start; k < last; k++) {
                const gain = Math.max(0, iAt(k + 1, fr.id) - iAt(k, fr.id));
                c -= w.lambdaFriendly * gain * oursShare(hits, fr.id, frames[k].t, frames[k + 1].t, playerId);
            }
        }
        const deadBy = (id: string, t: number) =>
            frames.some((f) => f.t <= t && f.t > f0.t && f.enemies.every((e) => e.id !== id || e.destroyed));
        const nearest = Math.min(...alive.map((e) => Math.hypot(e.x - f0.own.x, e.y - f0.own.y)));
        windows.push({
            t: f0.t,
            c,
            cMax,
            T: cMax > 1e-9 ? c / cMax : null,
            O,
            gun,
            dI,
            kill60: alive.some((e) => deadBy(e.id, f0.t + 60)),
            outranged: nearest > gunRange,
        });
        start = last;
    }
    return windows;
}
