import { RecordedDecision, RecordedRequest } from './decision-log';

import { BrainSpec } from '../brain/spec';
import { Policy } from '../brain/brain';
import { buildRequest } from '../brain/request';
import { stationControls } from '../brain/controls';
import { verbalReader } from '../brain/verbal';
import { whatIfForecaster } from '../whatif/forecast';

type ReaskRow = {
    t: number;
    control: string;
    before: string;
    after: string;
    beforeConfidence?: number;
    afterConfidence?: number;
};

/**
 * Asks a brain the questions a recorded run would have put to it, from exactly what the station
 * showed at each recorded decision, without running the game. It answers "would this wording have
 * decided differently?" in seconds; whether the different decisions win still takes a real run.
 */
export async function reask(
    spec: BrainSpec,
    policy: Policy,
    requests: readonly RecordedRequest[],
    decisions: readonly RecordedDecision[],
) {
    const rows: ReaskRow[] = [];
    const read = spec.view === 'verbal' ? verbalReader(spec.decisionSeconds) : undefined;
    const forecast = whatIfForecaster(spec);
    for (const recorded of requests.filter((r) => r.station === spec.station)) {
        const controls = stationControls({
            display: recorded.display,
            capabilities: recorded.capabilities,
            burstSeconds: Math.min(5, spec.decisionSeconds),
        });
        const answered = await policy.answer(
            buildRequest(
                spec,
                recorded.display,
                controls,
                read?.(recorded.display),
                recorded.heard,
                forecast?.(recorded.display, controls),
            ),
            controls,
            recorded.display,
        );
        for (const [control, answer] of Object.entries(answered.answers)) {
            const before = decisions.find(
                (d) => d.t === recorded.t && d.station === recorded.station && d.control === control,
            );
            if (before) {
                rows.push({
                    t: recorded.t,
                    control,
                    before: before.choice,
                    after: answer.choice,
                    beforeConfidence: before.confidence,
                    afterConfidence: answer.confidence,
                });
            }
        }
    }
    return rows;
}

/** Per control: how often the new brain agrees with the recorded one, and how its confidence moved. */
export function reaskSummary(rows: readonly ReaskRow[]) {
    const controls = [...new Set(rows.map((r) => r.control))].sort();
    return controls.map((control) => {
        const mine = rows.filter((r) => r.control === control);
        const mean = (values: (number | undefined)[]) => {
            const known = values.filter((v): v is number => v !== undefined);
            return known.length ? known.reduce((a, b) => a + b, 0) / known.length : NaN;
        };
        return {
            control,
            asked: mine.length,
            agreement: mine.filter((r) => r.before === r.after).length / mine.length,
            beforeConfidence: mean(mine.map((r) => r.beforeConfidence)),
            afterConfidence: mean(mine.map((r) => r.afterConfidence)),
            flipped: mine
                .filter((r) => r.before !== r.after)
                .map((r) => `${r.t.toFixed(1)}s ${r.before}→${r.after}`)
                .slice(0, 5),
        };
    });
}
