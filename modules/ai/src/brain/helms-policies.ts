import { Answer, Policy } from './brain';

import { Control } from './controls';
import { HelmsStyle, makeReferencePolicy } from './reference-policy';

/**
 * Scripted helms for validating a helms score: each is the reference helms with one known change, so a
 * score that does not rank it against the reference is not measuring helms play.
 * - `close-in`: never stands off; parks 500 m behind the target even under fire, no weave. It holds the
 *   firing position the whole fight, and a fighter strips the armor faster than the gun kills it.
 * - `no-weave`: stands off at 4000 m under fire, but parks still.
 * - `far-off`: parks 6000 m from the target, fired on or not: safe, and almost never in a firing position.
 * - `charge`: reference aim, but full forward thrust and the afterburner held down: overshoots, rams.
 * - `helms-random`: a uniformly random option of every helms control, from a fixed-seed generator.
 */
export const HELMS_POLICIES = ['close-in', 'no-weave', 'far-off', 'charge', 'helms-random'] as const;
export type HelmsPolicyName = (typeof HELMS_POLICIES)[number];

const STYLES: Record<'close-in' | 'no-weave' | 'far-off', HelmsStyle> = {
    'close-in': { standoff: 500, armedStandoff: 500, weaveMeters: 0 },
    'no-weave': { standoff: 500, armedStandoff: 4000, weaveMeters: 0 },
    'far-off': { standoff: 6000, armedStandoff: 6000, weaveMeters: 0 },
};

export function makeHelmsPolicy(name: HelmsPolicyName, decisionSeconds: number): Policy {
    switch (name) {
        case 'close-in':
        case 'no-weave':
        case 'far-off':
            return makeReferencePolicy(decisionSeconds, undefined, name, STYLES[name]);
        case 'charge':
            return chargePolicy(decisionSeconds);
        case 'helms-random':
            return randomPolicy(name, 0x4e1d5);
    }
}

function chargePolicy(decisionSeconds: number): Policy {
    const reference = makeReferencePolicy(decisionSeconds, undefined, 'charge');
    return {
        name: 'charge',
        async answer(request, controls, shown) {
            const { answers } = await reference.answer(request, controls, shown);
            for (const control of controls) {
                const [command] = control.id.split(':');
                const choice = command === 'boost' ? 'forward' : command === 'afterBurner' ? 'engage' : undefined;
                if (choice) answers[control.id] = { choice, source: 'rule' } satisfies Answer;
            }
            return { answers };
        },
    };
}

function randomPolicy(name: string, seed: number): Policy {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (control: Control) => {
        const options = Object.keys(control.options);
        return options[Math.floor(next() * options.length)];
    };
    return {
        name,
        answer(_request, controls) {
            const answers: Record<string, Answer> = {};
            for (const control of controls) answers[control.id] = { choice: pick(control), source: 'rule' };
            return Promise.resolve({ answers });
        },
    };
}
