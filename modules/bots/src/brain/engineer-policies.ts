import { Answer, Policy } from './brain';

import { Control } from './controls';
import { makeReferencePolicy } from './reference-policy';

/**
 * Scripted engineers for validating an engineer score: each is known better or worse than the
 * reference engineer, so a score that does not rank them so is not measuring the engineer.
 */
export const ENGINEER_POLICIES = [
    'reference-repairing',
    'never-jump-start',
    'all-max',
    'all-shutdown',
    'random',
] as const;
export type EngineerPolicyName = (typeof ENGINEER_POLICIES)[number];

export function makeEngineerPolicy(name: EngineerPolicyName, decisionSeconds: number): Policy {
    switch (name) {
        case 'reference-repairing':
            return makeReferencePolicy(decisionSeconds, { jumpStart: true, repair: 'all' }, name);
        case 'never-jump-start':
            return makeReferencePolicy(decisionSeconds, { jumpStart: false, repair: 'reactor' }, name);
        case 'all-max':
            return powerPolicy(name, () => 'raise');
        case 'all-shutdown':
            return powerPolicy(name, () => 'lower');
        case 'random':
            return powerPolicy(name, randomChoice(0x5eed));
    }
}

/**
 * Presses every system's power key the way `press` picks and rests every other control: no coolant,
 * no repairs, no jump-start.
 */
function powerPolicy(name: string, press: (control: Control) => string): Policy {
    return {
        name,
        answer(_request, controls) {
            const answers: Record<string, Answer> = {};
            for (const control of controls) {
                const choice = control.id.startsWith('systemPower:') ? press(control) : control.rest;
                answers[control.id] = { choice, source: 'rule' };
            }
            return Promise.resolve({ answers });
        },
    };
}

/** Uniform over a control's options, from a fixed-seed generator so a run replays. */
function randomChoice(seed: number) {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return (control: Control) => {
        const options = Object.keys(control.options);
        return options[Math.floor(next() * options.length)];
    };
}
