import { Capabilities, Display } from '../brain/controls';
import { EVENTS_EXT, RecordingEventLine, parseEventLine } from '@starwards/core/internal';

import { Answer } from '../brain/brain';
import { Heard } from '../brain/callout';
import fs from 'node:fs';

const RECORDING_EXT = '.sgr';

/** A `decision` event as the crew records it. */
export type RecordedDecision = Answer & {
    t: number;
    station: string;
    brain: string;
    version: number;
    policy: string;
    control: string;
    pressed: boolean;
};

/** A `brain_request` event: what one station showed and could do at one decision. */
export type RecordedRequest = {
    t: number;
    station: string;
    brain: string;
    version: number;
    specHash: string;
    policy: string;
    display: Display;
    capabilities: Capabilities;
    /** What the seat heard on the crew channel; absent in runs recorded before crew talk. */
    heard?: Heard[];
};

/** Reads the decision events recorded beside a recording (`x.sgr` or its `x.events.jsonl`). */
export function readDecisionLog(recordingPath: string) {
    const sidecar = recordingPath.endsWith(RECORDING_EXT)
        ? recordingPath.slice(0, -RECORDING_EXT.length) + EVENTS_EXT
        : recordingPath;
    const lines = fs
        .readFileSync(sidecar, 'utf8')
        .split('\n')
        .map(parseEventLine)
        .filter((l): l is RecordingEventLine => l !== null);
    const data = (kind: string) => lines.filter((l) => l.kind === kind).map((l) => ({ t: l.t, ...(l.data as object) }));
    return { decisions: data('decision') as RecordedDecision[], requests: data('brain_request') as RecordedRequest[] };
}

type ControlSummary = {
    station: string;
    control: string;
    decisions: number;
    fallbacks: number;
    meanConfidence: number;
    /** Tenth-percentile confidence: how unsure the brain is on its worst decisions of this control. */
    p10Confidence: number;
    /** Decisions whose choice differs from the previous one: a high rate on an axis reads as dithering. */
    flips: number;
    choices: Record<string, number>;
};

/** Per station and control: what was chosen, how often it changed, and how sure the brain was. */
export function summarizeDecisions(decisions: readonly RecordedDecision[]): ControlSummary[] {
    const byControl = new Map<string, RecordedDecision[]>();
    for (const d of decisions) {
        const key = `${d.station}/${d.control}`;
        byControl.set(key, [...(byControl.get(key) ?? []), d]);
    }
    return [...byControl.values()].map((list) => {
        const confidences = list
            .flatMap((d) => (d.confidence === undefined ? [] : [d.confidence]))
            .sort((a, b) => a - b);
        return {
            station: list[0].station,
            control: list[0].control,
            decisions: list.length,
            fallbacks: list.filter((d) => d.source === 'fallback').length,
            meanConfidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : NaN,
            p10Confidence: confidences.length ? confidences[Math.floor(0.1 * confidences.length)] : NaN,
            flips: list.filter((d, i) => i > 0 && d.choice !== list[i - 1].choice).length,
            choices: list.reduce<Record<string, number>>(
                (acc, d) => ({ ...acc, [d.choice]: (acc[d.choice] ?? 0) + 1 }),
                {},
            ),
        };
    });
}

/** The least confident decisions, with their time, to look up in the recording with `analyze at`. */
export function leastConfident(decisions: readonly RecordedDecision[], count: number) {
    return decisions
        .filter((d) => d.confidence !== undefined)
        .sort((a, b) => a.confidence! - b.confidence! || a.t - b.t)
        .slice(0, count);
}
