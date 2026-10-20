import { Answer, Policy } from './brain';

/** Rests every control: shows what a mission wrapper adds on top of a policy. */
export const idleTestPolicy: Policy = {
    name: 'idle',
    answer: (_request, controls) =>
        Promise.resolve({
            answers: Object.fromEntries(
                controls.map((c) => [c.id, { choice: c.rest, source: 'rule' } satisfies Answer]),
            ),
        }),
};
