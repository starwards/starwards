import { Faction, MagazineStock, magazineStock, magazineStocks } from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { STATIONS } from '@starwards/server/src/scenarios/wave-defence';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import { tapDamage } from '@starwards/server/src/test/damage-tap';
import { wrapMagazineHit } from './ideal';

type Stocks = Partial<Record<MagazineStock, number>>;

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
    /** Wave-3 GVTS damage per raider (by model), and wave-3 damage every station took from anyone. */
    wave3DamageByTarget: Record<string, { model: string; amount: number }>;
    wave3StationDamage: Record<string, number>;
    firstStationLostAt: number | null;
    countsAtFirstStationLoss: Stocks | null;
    countsAtEnd: Stocks;
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
        wave3DamageByTarget: {},
        wave3StationDamage: {},
        firstStationLostAt: null,
        countsAtFirstStationLoss: null,
        countsAtEnd: {},
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
        tapDamage(game, (id, damage) => {
            if (wave === 3 && stationIds.has(id))
                r.wave3StationDamage[id] = (r.wave3StationDamage[id] ?? 0) + damage.amount;
            if (damage.shipId !== TRAINING_PLAYER_ID) return;
            if (stationIds.has(id)) r.hitsOnStations++;
            const model = raiders.get(id);
            if (model === undefined) return;
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
            }
            if (spawned) {
                wave++;
                r.waveSpawnAt.push(game.seconds);
                if (wave === 3)
                    r.capacityAtWave3 = game.api.getShip(TRAINING_PLAYER_ID)?.state.magazine.capacity ?? null;
            }
            if (r.firstStationLostAt === null && STATIONS.some((s) => !game.api.getShip(s.id))) {
                r.firstStationLostAt = game.seconds;
                r.countsAtFirstStationLoss = counts(game);
            }
        },
        report(game: HeadlessGame): AmmoReport {
            r.countsAtEnd = counts(game);
            return r;
        },
    };
}
