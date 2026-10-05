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
 * Opportunity `O` = threat-weighted share of the window's 1 s frames in which a ground-truth firing
 * solution existed, from geometry alone (allowing for the gun's spread), never from what weapons fired:
 * it is helms' share of the credit split. Tactical `T = min(C, O·C_max) / C_max`, so
 * conversion `V = T / O` (to weapons) is at most 1 by construction and `log T = log O + log V`. A crew
 * that never fires has `V = 0` wherever `O > 0`.
 */
export interface TacticalWeights {
    /** Bonus on damage to the target held ≥ {@link HELD_SECONDS}: an owner value judgement. */
    readonly phi: number;
    readonly lambdaFriendly: number;
    readonly windowSeconds: number;
    /** Fastest incapacitation per second a full-strength gun reaches (fitted on reference runs). */
    readonly rho: number;
}

export const TACTICAL_WEIGHTS: TacticalWeights = { phi: 1, lambdaFriendly: 2, windowSeconds: 45, rho: 0.0272 };
const HELD_SECONDS = 5;

/**
 * Weapons station `K_w = 1 − w1·nosol − w2·dominated − w3·friendly + w4·lockUptime`, rates per round;
 * undefined for a run that fired no round (no demand, no score: never firing is V's failure, not a K_w win).
 */
export const WEAPONS_WEIGHTS = { nosol: 1, dominated: 1, friendly: 2, lock: 0.5 } as const;
/** Rule values the ammo value reads (`capsule.ts`, `attack-resolution-manager.ts`, `damage-manager.ts`). */
const CAPSULE_DEFECT_STEP = 0.1;
const SURFACE_EFFECT_FACTOR = 0.05;
/** A chain gun defect: half the time `rateOfFireFactor *= 0.9`. */
const GUN_DEFECT_LOSS = 0.5 * 0.1;
/** A thruster defect: half the time `availableCapacity −= U(0.01, 0.1)`. */
const THRUSTER_DEFECT_LOSS = 0.5 * 0.055;
/**
 * Blast geometry, measured from the `damage` and `defect` events of the 2026-10-03 weapons-score runs
 * (T0, T1, T1-MK2; reference, spray-fire and wrong-ammo crews; seeds 1-8, frozen; seeds 9-12 held out)
 * where the rules leave it open: a HiExp shell blast erodes 4.68 plates' worth (held out 4.16), and
 * reaches the capsule in 0.90 of the cases the defect roll allows once the plates are gone (held out
 * 0.99). Surface scrapes were measured too and agree with the rules (Frag: 0.026 gun and 0.12 thruster
 * defects per hit against 0.025 and 0.13 predicted), so they stay rule values. No ArmPen hit was
 * recorded, so impacts keep the rules' one plate and one system.
 */
const BLAST_PLATES = 4.68;
const BLAST_CAPSULE_ODDS = 0.9;
/** Frame solutions allow for the gun's spread out to this many standard deviations. */
const SPREAD_SIGMAS = 2;

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
    /** Kill progress and capability, the two factors of incapacitation. */
    readonly kill: number;
    readonly cap: number;
    /** Capability lost per unit of surface damage amount, summed over external systems (from the defect rules). */
    readonly surfaceExposure: number;
}

/** The player's weapons, as one frame shows them. */
export interface OwnWeapons {
    readonly gun: number;
    readonly gunBearing: number;
    readonly bulletSpeed: number;
    readonly spreadDegrees: number;
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

/** Output share of a system: none when broken or starved of energy, capped at what NORMAL power gives. */
const shipNormal = (s: { power: number; hacked: number; broken: boolean; energyStarved?: boolean }) =>
    s.broken || s.energyStarved ? 0 : Math.min(1, s.power / PowerLevel.NORMAL) * s.hacked;

function gunCapability(ship: ShipState) {
    const guns = [...ship.chainGuns];
    if (!guns.length) return 0;
    return guns.reduce((s, g) => s + shipNormal(g) * g.rateOfFireFactor, 0) / guns.length;
}

function mobility(ship: ShipState) {
    const ts = [...ship.thrusters];
    if (!ts.length) return 0;
    return ts.reduce((s, t) => s + shipNormal(t) * t.availableCapacity, 0) / ts.length;
}

/**
 * Capability lost per unit of surface damage amount: each external system rolls a defect with odds
 * amount/(2·damage50); a gun defect costs `GUN_DEFECT_LOSS` of its gun's share of `cap = gun·(½+½·mob)`,
 * a thruster defect `THRUSTER_DEFECT_LOSS` of its share of mobility; other systems leave cap alone.
 */
function surfaceExposure(ship: ShipState, gun: number, mob: number) {
    const guns = ship.chainGuns.length || 1;
    const thrusters = ship.thrusters.length || 1;
    let exposure = 0;
    for (const g of ship.chainGuns)
        if (!g.design.isInternal) exposure += ((GUN_DEFECT_LOSS / guns) * (0.5 + 0.5 * mob)) / (2 * g.design.damage50);
    for (const t of ship.thrusters)
        if (!t.design.isInternal)
            exposure += ((THRUSTER_DEFECT_LOSS / thrusters) * 0.5 * gun) / (2 * t.design.damage50);
    return exposure;
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
    const gun = gunCapability(ship);
    const mob = mobility(ship);
    const cap = gun * (0.5 + 0.5 * mob);
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
        kill,
        cap,
        surfaceExposure: surfaceExposure(ship, gun, mob),
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
            spreadDegrees: gun?.design.bulletDegreesDeviation ?? 0,
            fuzeSeconds: gun ? gun.shellSecondsToLive || gun.design.maxShellRange / gun.design.bulletSpeed : 0,
            gunAmmo: gun?.projectile ?? 'None',
            shellsInMagazine: shellAmmoTypes.filter(
                (a) => ship.magazine.getCount(a) > 0 && gun?.design[`use_${a}`] === true,
            ),
            targetId: ship.weaponsTarget.targetId,
            tubesReady:
                [...ship.tubes].some((tube) => shipNormal(tube) > 0) &&
                ['HiExpMissile', 'ArmPenMissile', 'FragMissile', 'ClusterMissile', 'TandemMissile', 'ElecMissile'].some(
                    (a) => ship.magazine.getCount(a as AmmoType) > 0,
                ),
        },
    };
}

type XYV = { x: number; y: number; vx: number; vy: number };

/**
 * Whether an unguided round from `shell` (position and velocity), fuzed to `fuzeSeconds`, passes
 * within its fuze and blast reach of `target` (moving straight) while closing on it; `spreadDegrees`
 * widens the reach by the gun's dispersion over the round's flight.
 */
export function shellReaches(
    shell: XYV,
    fuzeSeconds: number,
    ammo: AmmoType,
    target: XYV & { radius: number },
    spreadDegrees = 0,
) {
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
    const spread = Math.hypot(vx, vy) * tStar * Math.tan((spreadDegrees * Math.PI) / 180);
    return miss <= fuze + blastRadius(ammo) + target.radius + spread;
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
        if (shellReaches(shell, weapons.fuzeSeconds, ammo, enemy, SPREAD_SIGMAS * weapons.spreadDegrees)) return true;
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
 * Analytic value of one round of `ammo` against `target` in its current state, in incapacitation
 * `I = 1 − (1 − kill)·cap`: `ΔI = cap·Δkill + (1 − kill)·Δcap`. Δkill: plate erosion (½ of kill over the
 * whole armor; a blast erodes {@link BLAST_PLATES} plates, an impact one) and capsule defects behind
 * broken or penetrated plates (½·0.1 each; a blast reaches the capsule at {@link BLAST_CAPSULE_ODDS}, a
 * single-system round picks one internal system). Δcap: surface scrapes on external systems through
 * {@link ShipReading.surfaceExposure}. The blast geometry is measured; every other constant is a rule
 * value. Reactive armor is out of scope (#1970).
 */
export function ammoValue(ammo: AmmoType, target: ShipReading) {
    const design = ammoDesigns[ammo];
    const type = design.damageType;
    const profile = damageProfiles[type];
    const amount = roundAmount(ammo);
    const broken = target.plateHealthMax > 0 ? 1 - target.plateHealth / target.plateHealthMax : 1;
    const plates = design.delivery === 'explosion' ? BLAST_PLATES : 1;
    const plate = (0.5 * amount * plates * target.plateDamage[type]) / Math.max(target.plateHealthMax, 1);
    const exposed = broken + (1 - broken) * target.penetration[type];
    const capsuleOdds = profile.systemScope === 'single' ? 1 / Math.max(target.internals, 1) : BLAST_CAPSULE_ODDS;
    const capsuleDefects = profile.hitsInternal
        ? ((exposed * amount * profile.systemDamageFactor) / (2 * target.capsuleDamage50)) * capsuleOdds
        : 0;
    const dKill = plate + 0.5 * CAPSULE_DEFECT_STEP * capsuleDefects;
    const dCap = profile.surfaceDamageFactor * SURFACE_EFFECT_FACTOR * amount * target.surfaceExposure;
    return target.cap * dKill + (1 - target.kill) * dCap;
}

/** How much of the best available round's value a round of `ammo` gives up: 0 for the best, 1 for a worthless one. */
export function ammoShortfall(ammo: AmmoType, available: readonly AmmoType[], target: ShipReading) {
    const own = ammoValue(ammo, target);
    const best = Math.max(own, ...available.map((a) => ammoValue(a, target)));
    return best > 0 ? 1 - own / best : 0;
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
    /** Share of the locked time spent on the enemy that threatened most at that moment. */
    readonly lockThreat: number;
    readonly kw: number | null;
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
            dominated += ammoShortfall(s.ammo, f.weapons.shellsInMagazine, target);
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
    let onThreat = 0;
    for (const f of fighting) {
        const shares = threatShares(f.enemies);
        const top = [...shares].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (f.weapons.targetId && f.weapons.targetId === top) onThreat++;
    }
    const rate = (n: number) => (rated ? n / rated : 0);
    const w = WEAPONS_WEIGHTS;
    return {
        rounds: shots.length,
        nosol: rate(nosol),
        dominated: rate(dominated),
        friendly,
        lockUptime,
        lockThreat: locked ? onThreat / locked : 0,
        kw: rated
            ? 1 - w.nosol * rate(nosol) - w.dominated * rate(dominated) - w.friendly * friendly + w.lock * lockUptime
            : null,
    };
}

export interface TacticalWindow {
    readonly t: number;
    /** Credit, its ceiling, and their ratio T; null when nothing was left to take. */
    readonly c: number;
    readonly cMax: number;
    readonly T: number | null;
    readonly O: number;
    /** Whether the credit exceeded O·C_max and was cut to it, which keeps V = T/O ≤ 1. */
    readonly clipped: boolean;
    /** Our gun's mean capability over the window (the engineer covariate). */
    readonly gun: number;
    /** Incapacitation the enemies took in the window, whoever dealt it (the persistence baseline's input). */
    readonly dI: number;
    /** Whether an enemy alive at the window's start died within 60 s of it. */
    readonly kill60: boolean;
    /** Whether the nearest enemy started the window beyond our gun's range. */
    readonly outranged: boolean;
}

/**
 * Per victim, our share of the hits it took in each frame interval (frames[k].t, frames[k+1].t]; 0 for an
 * interval with no hit (unattributed loss is nobody's credit).
 */
function oursByInterval(hits: readonly Hit[], frames: readonly TacticalFrame[], playerId: string) {
    const ours = new Map<string, number[]>();
    const all = new Map<string, number[]>();
    for (const h of hits) {
        if (!frames.length || h.t <= frames[0].t || h.t > frames[frames.length - 1].t) continue;
        let k = frameAt(frames, h.t);
        if (frames[k].t >= h.t) k--;
        const sum = (m: Map<string, number[]>) => {
            let xs = m.get(h.victim);
            if (!xs) m.set(h.victim, (xs = new Array<number>(frames.length).fill(0)));
            return xs;
        };
        sum(all)[k] += h.weight;
        if (h.shooterId === playerId) sum(ours)[k] += h.weight;
    }
    return (victim: string, k: number) => {
        const a = all.get(victim)?.[k] ?? 0;
        return a > 0 ? (ours.get(victim)?.[k] ?? 0) / a : 0;
    };
}

/** What every window of a run reads: hit attribution and how long each frame's target had been held. */
interface TacticalRun {
    readonly frames: readonly TacticalFrame[];
    readonly ours: (victim: string, k: number) => number;
    readonly heldSince: readonly number[];
    readonly w: TacticalWeights;
    readonly gunRange: number;
}

function tacticalRun(
    frames: readonly TacticalFrame[],
    events: readonly RecordingEventLine[],
    playerId: string,
    w: TacticalWeights,
    gunRange: number,
): TacticalRun {
    const heldSince: number[] = [];
    let since = 0;
    frames.forEach((f, k) => {
        if (k === 0 || f.weapons.targetId !== frames[k - 1].weapons.targetId) since = f.t;
        heldSince.push(since);
    });
    return { frames, ours: oursByInterval(hitsOf(events, frames), frames, playerId), heldSince, w, gunRange };
}

/**
 * The window of {@link TacticalWeights.windowSeconds} starting at frame `start`, with the frame index it
 * ends at; `undefined` when no enemy is alive at its start or fewer than half its seconds remain.
 */
function windowAt(run: TacticalRun, start: number): { window: TacticalWindow; last: number } | undefined {
    const { frames, w, ours, heldSince } = run;
    const f0 = frames[start];
    const alive = f0.enemies.filter((e) => !e.destroyed);
    if (!alive.length) return undefined;
    const end = frames.findIndex((f) => f.t >= f0.t + w.windowSeconds);
    const last = end < 0 ? frames.length - 1 : end;
    if (frames[last].t - f0.t < w.windowSeconds / 2) return undefined;
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
            const held = frames[k].weapons.targetId === e.id && frames[k].t - heldSince[k] >= HELD_SECONDS;
            c += theta * (1 + (held ? w.phi : 0)) * gain * ours(e.id, k);
        }
    }
    for (const fr of f0.friends) {
        for (let k = start; k < last; k++) {
            const gain = Math.max(0, iAt(k + 1, fr.id) - iAt(k, fr.id));
            c -= w.lambdaFriendly * gain * ours(fr.id, k);
        }
    }
    const deadBy = (id: string, t: number) =>
        frames.some((f) => f.t <= t && f.t > f0.t && f.enemies.every((e) => e.id !== id || e.destroyed));
    const nearest = Math.min(...alive.map((e) => Math.hypot(e.x - f0.own.x, e.y - f0.own.y)));
    const ceiling = O * cMax;
    return {
        last,
        window: {
            t: f0.t,
            c: Math.min(c, ceiling),
            cMax,
            T: cMax > 1e-9 ? Math.min(c, ceiling) / cMax : null,
            O,
            clipped: c > ceiling + 1e-12,
            gun,
            dI,
            kill60: alive.some((e) => deadBy(e.id, f0.t + 60)),
            outranged: nearest > run.gunRange,
        },
    };
}

/** Consecutive windows over a run while an enemy is alive at the window's start. */
export function tacticalWindows(
    frames: readonly TacticalFrame[],
    events: readonly RecordingEventLine[],
    playerId: string,
    w: TacticalWeights = TACTICAL_WEIGHTS,
    gunRange = 8000,
): TacticalWindow[] {
    const run = tacticalRun(frames, events, playerId, w, gunRange);
    const windows: TacticalWindow[] = [];
    let start = 0;
    while (start < frames.length - 1) {
        const at = windowAt(run, start);
        if (!at) break;
        windows.push(at.window);
        start = at.last;
    }
    return windows;
}

/**
 * The window starting at every frame (sliding, one per frame): the snapshot scorer's tactical labels.
 * `undefined` where {@link tacticalWindows} would end the run's windows.
 */
export function tacticalSeries(
    frames: readonly TacticalFrame[],
    events: readonly RecordingEventLine[],
    playerId: string,
    w: TacticalWeights = TACTICAL_WEIGHTS,
): (TacticalWindow | undefined)[] {
    const run = tacticalRun(frames, events, playerId, w, Infinity);
    return frames.map((_, start) => (start < frames.length - 1 ? windowAt(run, start)?.window : undefined));
}
