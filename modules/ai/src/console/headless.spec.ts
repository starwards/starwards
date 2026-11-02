import * as v8 from 'node:v8';
import * as vm from 'node:vm';

import { DEFAULT_WAVE_TUNING, createWaveDefenceMap } from '@starwards/server/src/scenarios/wave-defence';
import { Faction, mulberry32 } from '@starwards/core/internal';
import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { inProcessShipIntel } from './headless';

/** A full collection without `--expose-gc`. */
const collect = () => {
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc') as () => void;
    gc();
    gc();
};

describe('inProcessShipIntel', () => {
    it('lets go of the decoded snapshot of a ship that is gone', async () => {
        const raiders: string[] = [];
        const map = createWaveDefenceMap(mulberry32(1), DEFAULT_WAVE_TUNING, {
            onWaveSpawned: (_, ids) => raiders.push(...ids),
        });
        const game = HeadlessGame.start(map, 1);
        game.tick(0.1);
        const id = raiders[0];
        game.api.grantSnapshot(id, Faction.Gravitas);
        const source = inProcessShipIntel(game);
        const held = new WeakRef(source.snapshot(game.spaceManager.state.getShip(id)!, Faction.Gravitas)!.state);

        game.api.convertToDerelict(id);
        for (let i = 0; i < 5; i++) game.tick(0.1);
        expect(game.spaceManager.factionIntel.getSnapshot(id, Faction.Gravitas)).toBeUndefined();
        await new Promise((r) => setImmediate(r)); // a WeakRef holds its target until the job ends
        collect();
        expect(held.deref()).toBeUndefined();
    });
});
