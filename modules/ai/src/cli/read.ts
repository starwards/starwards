/**
 * What a station's verbal UI said at a recorded decision: the sentences a `verbal` brain reads.
 *
 *   npm --prefix modules/ai run read -- --recording <x.sgr> --station helms [--t 30]
 *
 * Without `--t`, reads the first decision. The reading includes the trend since the previous one.
 */
import { readDecisionLog } from '../training/decision-log';
import { verbalReader } from '../brain/verbal';

function arg(name: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const recording = arg('recording');
const station = arg('station');
if (!recording || !station) {
    throw new Error('usage: read --recording <path.sgr> --station <station> [--t <seconds>]');
}
const requests = readDecisionLog(recording).requests.filter((r) => r.station === station);
const at = Number(arg('t') ?? requests[0]?.t ?? 0);
const index = Math.max(
    0,
    requests.findIndex((r) => r.t >= at - 1e-6),
);
const interval = requests.length > 1 ? requests[1].t - requests[0].t : 1;
const read = verbalReader(interval);
let lines: string[] = [];
for (const request of requests.slice(Math.max(0, index - 1), index + 1)) {
    lines = read(request.display);
}
process.stdout.write(`${station} at ${requests[index]?.t.toFixed(2)} s\n${lines.join('\n')}\n`);
