import { Faction, MagazineStock, magazineStock, magazineStocks } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { STATIONS } from '@starwards/server/src/scenarios/wave-defence';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import { tapDamage, tapDerelicts } from '@starwards/server/src/test/damage-tap';
import { wrapMagazineHit } from './ideal';

type Stocks = Partial<Record<MagazineStock, number>>;

/** One raider's fight, for the shells-per-kill mechanism checks. */
export type RaiderReport = {
    model: string;
    wave: number;
    spawnAt: number;
    firstHitAt: number | null;
    killedAt: number | null;
    /** GVTS damage events on it and their summed amount. */
    gvtsHits: number;
    gvtsDamage: number;
    /** Damage from anyone else (stations). */
    otherDamage: number;
    /** Armor and capsule health it regained between ticks (repair or regeneration). */
    armorRegained: number;
    capsuleRegained: number;
    /** Each plate's health share when it died (or at the end). */
    platesAtEnd: number[];
    /** GVTS-to-raider distance at each GVTS hit, and the seconds between consecutive GVTS hits. */
    hitRanges: number[];
    hitGaps: number[];
};

/** How the GVTS spent its magazine in one wave run. Waves are numbered from 1; 0 is before any raider. */
export type AmmoReport = {
    waveSpawnAt: number[];
    /** Rounds drawn from the magazine (loaded into a gun or tube), per wave, per stock. */
    fired: Record<number, Stocks>;
    firedTotal: Stocks;
    /** Rounds magazine hits destroyed, per stock. */
    lostToHits: Stocks;
    /** Sim-second each stock that started non-empty first hit 0. */
    emptyAt: Stocks;
    /** GVTS weapon-damage events on raiders and on friendly stations. */
    hitsOnRaiders: number;
    hitsOnStations: number;
    capacityAtWave3: number | null;
    /** Magazine counts when wave 3 spawned. */
    countsAtWave3: Stocks | null;
    /** Damage every station took from anyone, per wave. */
    stationDamageByWave: Record<number, number>;
    /** Wave-3 GVTS damage per raider (by model), and wave-3 damage every station took from anyone. */
    wave3DamageByTarget: Record<string, { model: string; amount: number }>;
    wave3StationDamage: Record<string, number>;
    firstStationLostAt: number | null;
    countsAtFirstStationLoss: Stocks | null;
    countsAtEnd: Stocks;
    /** Raiders killed per wave (by anyone). */
    killsByWave: Record<number, number>;
    raiders: Record<string, RaiderReport>;
};

/** Watches the GVTS magazine through a run; `tick` before the crew each tick (after any ideal script). */
export function ammoTelemetry() {
    let wave = 0;
    let installed = false;
    let inHit = false;
    const raiders = new Map<string, string>();
    const r: AmmoReport = {
        waveSpawnAt: [],
        fired: {},
        firedTotal: {},
        lostToHits: {},
        emptyAt: {},
        hitsOnRaiders: 0,
        hitsOnStations: 0,
        capacityAtWave3: null,
        countsAtWave3: null,
        stationDamageByWave: {},
        wave3DamageByTarget: {},
        wave3StationDamage: {},
        firstStationLostAt: null,
        countsAtFirstStationLoss: null,
        countsAtEnd: {},
        killsByWave: {},
        raiders: {},
    };
    /** Last tick's armor and capsule health per raider. */
    const lastHealth = new Map<string, { armor: number[]; capsule: number }>();
    const lastHitAt = new Map<string, number>();
    const healthOf = (game: HeadlessGame, id: string) => {
        const s = game.shipManagers.get(id)?.state;
        if (!s) return null;
        return {
            armor: s.armor.armorPlates.map((p) => p.layers.reduce((a, l) => a + l.health, 0)),
            max: s.armor.armorPlates.map((p) => p.layers.reduce((a, l) => a + l.maxHealth, 0)),
            capsule: s.capsule.integrity,
        };
    };
    const platesShare = (game: HeadlessGame, id: string) => {
        const h = healthOf(game, id);
        return h ? h.armor.map((a, i) => +(a / Math.max(1e-9, h.max[i])).toFixed(3)) : [];
    };
    const add = (into: Stocks, s: MagazineStock, n: number) => (into[s] = (into[s] ?? 0) + n);
    const counts = (game: HeadlessGame): Stocks => {
        const m = game.api.getShip(TRAINING_PLAYER_ID)?.state.magazine;
        return m ? Object.fromEntries(magazineStocks.map((s) => [s, m.getCount(s)])) : {};
    };

    function install(game: HeadlessGame) {
        const state = game.api.getShip(TRAINING_PLAYER_ID)?.state;
        if (!state) return;
        installed = true;
        const magazine = state.magazine;
        const started = new Set(magazineStocks.filter((s) => magazine.getCount(s) > 0));
        const setCount = magazine.setCount.bind(magazine);
        magazine.setCount = (m, value) => {
            const s = magazineStock(m);
            const before = magazine.getCount(m);
            setCount(m, value);
            const delta = magazine.getCount(m) - before;
            if (inHit) add(r.lostToHits, s, -delta);
            else if (delta < 0 || (delta === 1 && !state.docking.isDocked)) {
                add((r.fired[wave] ??= {}), s, -delta);
                add(r.firedTotal, s, -delta);
            }
            for (const x of magazineStocks) {
                if (started.has(x) && r.emptyAt[x] === undefined && magazine.getCount(x) === 0)
                    r.emptyAt[x] = game.seconds;
            }
        };
        wrapMagazineHit(game, (original) => (mag, id) => {
            inHit = true;
            try {
                original(mag, id);
            } finally {
                inHit = false;
            }
        });
        const stationIds = new Set(STATIONS.map((s) => s.id));
        tapDerelicts(game, (id) => {
            const rr = r.raiders[id];
            if (!rr || rr.killedAt !== null) return;
            rr.killedAt = game.seconds;
            rr.platesAtEnd = platesShare(game, id);
            r.killsByWave[rr.wave] = (r.killsByWave[rr.wave] ?? 0) + 1;
        });
        tapDamage(game, (id, damage) => {
            if (stationIds.has(id)) r.stationDamageByWave[wave] = (r.stationDamageByWave[wave] ?? 0) + damage.amount;
            if (wave === 3 && stationIds.has(id))
                r.wave3StationDamage[id] = (r.wave3StationDamage[id] ?? 0) + damage.amount;
            const rr = r.raiders[id];
            if (rr && damage.shipId !== TRAINING_PLAYER_ID) rr.otherDamage += damage.amount;
            if (damage.shipId !== TRAINING_PLAYER_ID) return;
            if (stationIds.has(id)) r.hitsOnStations++;
            const model = raiders.get(id);
            if (model === undefined) return;
            if (rr) {
                rr.gvtsHits++;
                rr.gvtsDamage += damage.amount;
                rr.firstHitAt ??= game.seconds;
                const prev = lastHitAt.get(id);
                if (prev !== undefined) rr.hitGaps.push(+(game.seconds - prev).toFixed(2));
                lastHitAt.set(id, game.seconds);
                const me = game.spaceManager.state.getShip(TRAINING_PLAYER_ID);
                const it = game.spaceManager.state.getShip(id);
                if (me && it) rr.hitRanges.push(Math.round(Math.hypot(me.position.x - it.position.x, me.position.y - it.position.y)));
            }
            r.hitsOnRaiders++;
            if (wave === 3) {
                const t = (r.wave3DamageByTarget[id] ??= { model, amount: 0 });
                t.amount += damage.amount;
            }
        });
    }

    return {
        tick(game: HeadlessGame) {
            if (!installed) install(game);
            let spawned = false;
            for (const [id, manager] of game.shipManagers) {
                if (manager.state.faction !== Faction.Raiders || raiders.has(id)) continue;
                raiders.set(id, game.spaceManager.state.getShip(id)?.model ?? '');
                spawned = true;
                r.raiders[id] = {
                    model: raiders.get(id)!,
                    wave: wave + 1,
                    spawnAt: game.seconds,
                    firstHitAt: null,
                    killedAt: null,
                    gvtsHits: 0,
                    gvtsDamage: 0,
                    otherDamage: 0,
                    armorRegained: 0,
                    capsuleRegained: 0,
                    platesAtEnd: [],
                    hitRanges: [],
                    hitGaps: [],
                };
            }
            if (spawned) {
                wave++;
                r.waveSpawnAt.push(game.seconds);
                if (wave === 3) {
                    r.capacityAtWave3 = game.api.getShip(TRAINING_PLAYER_ID)?.state.magazine.capacity ?? null;
                    r.countsAtWave3 = counts(game);
                }
            }
            for (const [id, rr] of Object.entries(r.raiders)) {
                if (rr.killedAt !== null) continue;
                const h = healthOf(game, id);
                if (!h) continue;
                const before = lastHealth.get(id);
                if (before) {
                    h.armor.forEach((a, i) => (rr.armorRegained += Math.max(0, a - (before.armor[i] ?? a))));
                    rr.capsuleRegained += Math.max(0, h.capsule - before.capsule);
                }
                lastHealth.set(id, h);
            }
            if (r.firstStationLostAt === null && STATIONS.some((s) => !game.api.getShip(s.id))) {
                r.firstStationLostAt = game.seconds;
                r.countsAtFirstStationLoss = counts(game);
            }
        },
        report(game: HeadlessGame): AmmoReport {
            r.countsAtEnd = counts(game);
            for (const [id, rr] of Object.entries(r.raiders)) if (rr.killedAt === null) rr.platesAtEnd = platesShare(game, id);
            return r;
        },
    };
}
