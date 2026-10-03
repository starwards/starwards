import { agreementSummary, recordedChoices, teacherAgreement, withinReach } from './agree';

import { Control } from '../brain/controls';
import { RecordedRequest } from './decision-log';

/** A weapons console: no lock, then a lock on a contact dead ahead in range, then one far off the nose. */
function weaponsRequest(t: number, targetId: string | null, bearing: number): RecordedRequest {
    return {
        t,
        station: 'weapons',
        brain: 'weapons',
        version: 1,
        specHash: 'x',
        policy: 'test',
        capabilities: {
            commands: [{ command: 'fireChainGun', count: 1 }, { command: 'nextTarget' }, { command: 'clearTarget' }],
        },
        display: {
            panels: { 'targeting-status': { targetId } },
            radar: {
                ownShip: { heading: 0, position: { x: 0, y: 0 } },
                contacts: [{ id: 'enemy', distance: 3000, bearing, position: { x: 3000, y: 0 }, type: 'Spaceship' }],
            },
        },
    };
}

const requests = [weaponsRequest(0, null, 0), weaponsRequest(1, 'enemy', 0), weaponsRequest(2, 'enemy', 40)];
const choose =
    (choices: Record<string, string>[]) =>
    (request: RecordedRequest, controls: readonly Control[]): Map<string, string> =>
        new Map(controls.flatMap((c) => (c.id in choices[request.t] ? [[c.id, choices[request.t][c.id]]] : [])));

describe('teacher agreement', () => {
    it('samples every control the brain answered against the reference, marking where the reference acts', async () => {
        const samples = await teacherAgreement(
            requests,
            choose([
                { target: 'next', 'fireChainGun:0': 'hold_fire' },
                { target: 'none', 'fireChainGun:0': 'hold_fire' },
                { 'fireChainGun:0': 'fire' },
            ]),
        );
        expect(samples).toEqual([
            { control: 'fireChainGun:0', teacher: 'hold_fire', student: 'hold_fire', teacherActs: false },
            { control: 'target', teacher: 'next', student: 'next', teacherActs: true },
            { control: 'fireChainGun:0', teacher: 'fire', student: 'hold_fire', teacherActs: true },
            { control: 'target', teacher: 'none', student: 'none', teacherActs: false },
            { control: 'fireChainGun:0', teacher: 'hold_fire', student: 'fire', teacherActs: false },
        ]);
        const [all, fire, target] = agreementSummary(samples);
        expect(fire).toMatchObject({ decisions: 3, acts: 1, actAgreement: 0, restAgreement: 0.5 });
        expect(fire.agreement).toBeCloseTo(1 / 3, 9);
        expect(target).toMatchObject({ decisions: 2, agreement: 1, acts: 1, actAgreement: 1, restAgreement: 1 });
        // overall, every decision where the reference acts weighs the same
        expect(all).toMatchObject({ control: 'all', decisions: 5, acts: 2, actAgreement: 0.5 });
    });

    it('leaves a control the reference never plays out of the overall score', () => {
        const [all] = agreementSummary([
            { control: 'target', teacher: 'next', student: 'next', teacherActs: true },
            { control: 'dock', teacher: 'wait', student: 'press', teacherActs: false },
        ]);
        expect(all).toMatchObject({ decisions: 1, agreement: 1 });
    });

    it('reads the playing brain’s own choices back from the recorded decisions', async () => {
        const decision = (t: number, control: string, choice: string) => ({
            t,
            station: 'weapons',
            brain: 'weapons',
            version: 1,
            policy: 'jev',
            control,
            choice,
            pressed: true,
            source: 'model' as const,
        });
        const samples = await teacherAgreement(
            requests.slice(0, 2),
            recordedChoices([
                decision(0, 'target', 'next'),
                decision(1, 'fireChainGun:0', 'fire'),
                { ...decision(1, 'fireChainGun:0', 'hold_fire'), station: 'helms' },
            ]),
        );
        expect(samples.map((s) => `${s.control} ${s.student} ${s.teacher}`)).toEqual([
            'target next next',
            'fireChainGun:0 fire fire',
        ]);
    });

    it('cuts the radar to a reach for both, so the reference no longer sees a contact beyond it', async () => {
        expect(withinReach(requests[1].display, 2000).radar).toMatchObject({ contacts: [] });
        expect(withinReach(requests[1].display, 5000)).toEqual(requests[1].display);
        const fire = choose([{}, { 'fireChainGun:0': 'fire' }]);
        const [seen] = await teacherAgreement([requests[1]], fire);
        const [cut] = await teacherAgreement([requests[1]], fire, 2000);
        expect([seen.teacher, cut.teacher]).toEqual(['fire', 'hold_fire']);
    });
});
