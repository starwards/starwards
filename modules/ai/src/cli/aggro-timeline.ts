/**
 * Per-NPC held-target timeline from a recording's `aggro` sidecar lines (record with `--aggro-log`):
 * one line per switch with the scores that decided it, then the NPC's last top threats.
 *
 *   npm run aggro-timeline -- <x.sgr> [<y.sgr>...]
 */
import path from 'node:path';
import { readAggroEvents } from '../scoring/recording';

const fmt = (n: number) => n.toFixed(1);

function main() {
    for (const file of process.argv.slice(2)) {
        const events = readAggroEvents(file);
        process.stdout.write(`${path.basename(file)}: ${events.length} aggro lines\n`);
        const ids = [...new Set(events.map((e) => e.objectId))];
        for (const id of ids) {
            const own = events.filter((e) => e.objectId === id);
            const { type, order } = own[0].data;
            const switches = own.flatMap(({ t, data: { why } }) =>
                why
                    ? [
                          `${fmt(t)}s ${why.from || 'mission'}->${why.to || 'mission'} (${fmt(why.challengerScore)} vs ${fmt(why.heldScore)})`,
                      ]
                    : [],
            );
            const last = own[own.length - 1];
            const top = last.data.top.map((e) => `${e.id}=${fmt(e.score)}/${fmt(e.idleS)}s`).join(' ');
            process.stdout.write(
                `  ${id} ${type.model}/${type.character ?? '-'} order=${order.kind}:${order.targetId ?? ''}\n` +
                    `    switches: ${switches.join(' | ') || 'none'}\n` +
                    `    last ${fmt(last.t)}s held=${last.data.held || 'mission'} top: ${top || 'empty'}\n`,
            );
        }
    }
}

main();
