import { Control, Display, stationControls } from '../brain/controls';
import { RecordedDecision, RecordedRequest } from './decision-log';

import { BrainRequest } from '../brain/request';
import { makeReferencePolicy } from '../brain/reference-policy';

/** One control at one recorded decision: what the reference policy chose and what the brain chose. */
export type AgreementSample = { control: string; teacher: string; student: string; teacherActs: boolean };

/** What the brain under test chose at a recorded decision, by control id; a control it left out is not scored. */
export type StudentChoices = (
    request: RecordedRequest,
    controls: readonly Control[],
    display: Display,
) => Promise<Map<string, string>> | Map<string, string>;

type Radar = { contacts?: { distance: number }[] };

/** The display with radar contacts beyond `reach` metres dropped, as a station radar of that reach shows it. */
export function withinReach(display: Display, reach: number): Display {
    const radar = display.radar as Radar | undefined;
    return radar?.contacts
        ? { ...display, radar: { ...radar, contacts: radar.contacts.filter((c) => c.distance <= reach) } }
        : display;
}

/**
 * Scores a brain against the reference policy, the teacher, on what one station showed at each
 * recorded decision of one run: the reference is asked the same displays in order (it remembers the
 * last radar fix), and each control gives one sample. No game is played, so a brain version can be
 * ranked in seconds; whether agreeing with the teacher wins is a separate question, answered by rungs.
 *
 * `requests` are one station's, in time order. With `reach`, both read the radar cut to that range,
 * for runs recorded before station radars were cut to their reach.
 */
export async function teacherAgreement(
    requests: readonly RecordedRequest[],
    student: StudentChoices,
    reach?: number,
): Promise<AgreementSample[]> {
    const gaps = requests.slice(1).map((r, i) => r.t - requests[i].t);
    const decisionSeconds = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 1;
    const teacher = makeReferencePolicy(decisionSeconds);
    const samples: AgreementSample[] = [];
    for (const recorded of requests) {
        const display = reach === undefined ? recorded.display : withinReach(recorded.display, reach);
        const controls = stationControls({
            display,
            capabilities: recorded.capabilities,
            burstSeconds: Math.min(5, decisionSeconds),
        });
        // the reference reads the raw display, never the request
        const taught = await teacher.answer({ state: {}, questions: {} } satisfies BrainRequest, controls, display);
        const chosen = await student({ ...recorded, display }, controls, display);
        for (const control of controls) {
            const choice = chosen.get(control.id);
            if (choice === undefined) continue;
            const teacherChoice = taught.answers[control.id].choice;
            samples.push({
                control: control.id,
                teacher: teacherChoice,
                student: choice,
                teacherActs: teacherChoice !== control.rest,
            });
        }
    }
    return samples;
}

/** The choices the run's own brain made, read back from its recorded decisions. */
export function recordedChoices(decisions: readonly RecordedDecision[]): StudentChoices {
    const byDecision = new Map<string, Map<string, string>>();
    for (const d of decisions) {
        const key = `${d.station}@${d.t}`;
        byDecision.set(key, (byDecision.get(key) ?? new Map<string, string>()).set(d.control, d.choice));
    }
    return (request) => byDecision.get(`${request.station}@${request.t}`) ?? new Map<string, string>();
}

type AgreementRow = {
    control: string;
    decisions: number;
    /** Share of all decisions where the brain chose what the reference chose. */
    agreement: number;
    /** Decisions where the reference did something other than rest, and the brain's agreement on those. */
    acts: number;
    actAgreement: number;
    /** The brain's agreement where the reference rested: low means it presses when the teacher would not. */
    restAgreement: number;
};

function row(control: string, samples: readonly AgreementSample[]): AgreementRow {
    const share = (of: readonly AgreementSample[]) =>
        of.length ? of.filter((s) => s.student === s.teacher).length / of.length : NaN;
    const acting = samples.filter((s) => s.teacherActs);
    return {
        control,
        decisions: samples.length,
        agreement: share(samples),
        acts: acting.length,
        actAgreement: share(acting),
        restAgreement: share(samples.filter((s) => !s.teacherActs)),
    };
}

/**
 * Agreement per control, and overall (`all`) over the controls the reference plays, that is, ever
 * acts on in these samples. `all.actAgreement` weighs every decision where the reference acts
 * equally, so a control the reference seldom touches counts for little.
 */
export function agreementSummary(samples: readonly AgreementSample[]): AgreementRow[] {
    const controls = [...new Set(samples.map((s) => s.control))].sort();
    const rows = controls.map((control) =>
        row(
            control,
            samples.filter((s) => s.control === control),
        ),
    );
    const played = new Set(rows.filter((r) => r.acts > 0).map((r) => r.control));
    return [
        row(
            'all',
            samples.filter((s) => played.has(s.control)),
        ),
        ...rows,
    ];
}
