import * as fs from 'node:fs';
import { PlayerProxy, runWaveDefence } from '../wave-defence-balance-harness';

/**
 * `node -r ts-node/register/transpile-only run-wave-defence.ts --seed 1 --proxy targeted-station --max-sim 1920 --out run.json`
 * One headless wave-defence run as JSON: waves, and per raider its fate and arrival-phase gunnery.
 */
function arg(name: string, fallback: string): string {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 ? process.argv[at + 1] : fallback;
}

const started = Date.now();
const result = runWaveDefence({
    seed: Number(arg('seed', '1')),
    proxy: arg('proxy', 'nearest-station') as PlayerProxy,
    maxSimSeconds: Number(arg('max-sim', '1920')),
});
const json = JSON.stringify(
    {
        ...result,
        raiders: result.raiders.map(({ state: _state, ...raider }) => raider),
        wallSeconds: (Date.now() - started) / 1000,
    },
    null,
    1,
);
fs.writeFileSync(arg('out', `wave-defence_seed${result.seed}.json`), json);
