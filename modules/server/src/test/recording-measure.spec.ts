import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Faction, GameApi, GameMap, ShipModel } from '@starwards/core/internal';
import { newAsteroid, newShip } from '../admin/map-helper';
import { GameRecorder } from '../recording/game-recorder';
import { makeDriver } from './driver';

/**
 * SPEC-0006 T6, a measurement and not a CI test: records one live game (real rooms) twice at once,
 * as v1 snapshots every 100 ms and as v2 (1000 ms keyframes + patch deltas), and prints the sizes.
 * Run with `STARWARDS_RECORDING_MEASURE=<output dir>` (and optionally `STARWARDS_RECORDING_MEASURE_SECONDS`).
 */
const outDir = process.env.STARWARDS_RECORDING_MEASURE;
const seconds = Number(process.env.STARWARDS_RECORDING_MEASURE_SECONDS ?? 180);

const raiders: ShipModel[] = ['dragonfly-MK1', 'predator', 'glaive', 'dragonfly-MK2'];
const allies: ShipModel[] = ['cataphract', 'dragonfly-MK2'];

/** a player ship and NPCs of two sides close enough to fight from the start */
const skirmish: GameMap = (() => {
    let api: GameApi | null = null;
    let sinceOrders = Infinity;
    const ids = { raiders: raiders.map((_, i) => `R${i}`), allies: allies.map((_, i) => `A${i}`) };
    return {
        name: 'skirmish',
        init: (game: GameApi) => {
            api = game;
            for (let i = 0; i < 10; i++) game.addObject(newAsteroid());
            const player = newShip('GVTS', Faction.Gravitas, 'gravitas');
            player.position.x = player.position.y = 0;
            game.addPlayerSpaceship(player);
            raiders.forEach((model, i) => {
                const ship = newShip(ids.raiders[i], Faction.Raiders, model);
                ship.position.x = 1500 + i * 200;
                ship.position.y = i * 300 - 450;
                game.addNpcSpaceship(ship);
            });
            allies.forEach((model, i) => {
                const ship = newShip(ids.allies[i], Faction.Gravitas, model);
                ship.position.x = 300;
                ship.position.y = i * 400 - 200;
                game.addNpcSpaceship(ship);
            });
        },
        update: (deltaSeconds: number) => {
            sinceOrders += deltaSeconds;
            if (!api || sinceOrders < 5) return;
            sinceOrders = 0;
            const alive = (id: string) => api?.getObject(id) && !api.getObject(id)?.destroyed;
            const liveAllies = ['GVTS', ...ids.allies].filter(alive);
            const liveRaiders = ids.raiders.filter(alive);
            liveRaiders.forEach((id, i) => {
                if (liveAllies.length) api?.orderAttack(id, liveAllies[i % liveAllies.length]);
            });
            ids.allies.filter(alive).forEach((id, i) => {
                if (liveRaiders.length) api?.orderAttack(id, liveRaiders[i % liveRaiders.length]);
            });
        },
    };
})();

(outDir ? describe : describe.skip)('recording size measurement (T6)', () => {
    const gameDriver = makeDriver();

    it(
        'records a skirmish as v1 at 100 ms and as v2 at the same time',
        async () => {
            process.env.STARWARDS_RECORDING_DELTAS = '1';
            gameDriver.gameManager.state.speed = 1;
            await gameDriver.gameManager.startGame(skirmish);
            const dirA = path.join(outDir!, 'A-v1-100ms');
            const dirB = path.join(outDir!, 'B-v2-1000ms-deltas');
            const a = new GameRecorder(gameDriver.gameManager, dirA, 100, () => false);
            const b = new GameRecorder(gameDriver.gameManager, dirB, 1000, () => true);
            const fileA = await a.startRecording();
            gameDriver.gameManager.state.isRecordingGame = false; // let the second recorder start on the same game
            const fileB = await b.startRecording();
            await new Promise((res) => setTimeout(res, seconds * 1000));
            const summaryA = await a.stopRecording();
            const summaryB = await b.stopRecording();
            const sizes = {
                A: { file: path.join(dirA, fileA), bytes: (await fs.stat(path.join(dirA, fileA))).size, summaryA },
                B: { file: path.join(dirB, fileB), bytes: (await fs.stat(path.join(dirB, fileB))).size, summaryB },
            };
            await fs.writeFile(path.join(outDir!, 'sizes.json'), JSON.stringify(sizes, null, 2));
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(sizes, null, 2));
        },
        (seconds + 60) * 1000,
    );
});
