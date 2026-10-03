import { Capabilities, Display, stationControls } from './controls';

import { brainSpecSchema } from './spec';
import { buildRequest } from './request';

const helmsDisplay: Display = {
    panels: {
        'helms-stats': {
            maneuveringCommand: { x: 0.2, y: -1 },
            rotationCommand: 0,
            afterBurner: 0,
            antiDrift: 1,
            breaks: 0,
        },
    },
    radar: { contacts: [] },
};
const helmsCapabilities: Capabilities = {
    commands: [
        'rotation',
        'strafe',
        'boost',
        'rotationMode',
        'afterBurner',
        'antiDrift',
        'warpUp',
        'warpDown',
        'dock',
    ].map((command) => ({ command })),
};

function controlsById(display: Display, capabilities: Capabilities) {
    return new Map(stationControls({ display, capabilities, burstSeconds: 0.5 }).map((c) => [c.id, c]));
}

describe('station controls', () => {
    it('offers each axis as its two keys, no press, and centre, stepping from the displayed value', () => {
        const boost = controlsById(helmsDisplay, helmsCapabilities).get('boost')!;
        expect(Object.keys(boost.options)).toEqual(['forward', 'back', 'hold', 'centre']);
        expect(boost.press('forward')).toEqual({ command: 'boost', args: {}, value: 0.25 });
        expect(boost.press('back')).toEqual({ command: 'boost', args: {}, value: 0.15 });
        expect(boost.press('centre')).toEqual({ command: 'boost', args: {}, value: 0 });
        expect(boost.press('hold')).toBeUndefined();
        expect(boost.rest).toBe('hold');
    });

    it('keeps an axis inside its range', () => {
        const strafe = controlsById(helmsDisplay, helmsCapabilities).get('strafe')!;
        expect(strafe.press('left')).toEqual({ command: 'strafe', args: {}, value: -1 });
    });

    it('presses a held key only when its state changes', () => {
        const controls = controlsById(helmsDisplay, helmsCapabilities);
        expect(controls.get('afterBurner')!.press('engage')).toEqual({ command: 'afterBurner', args: {}, value: 1 });
        expect(controls.get('antiDrift')!.press('engage')).toBeUndefined();
        expect(controls.get('antiDrift')!.press('release')).toEqual({ command: 'antiDrift', args: {}, value: 0 });
    });

    it('folds mutually exclusive keys into one control with a none option', () => {
        const warp = controlsById(helmsDisplay, helmsCapabilities).get('warp')!;
        expect(Object.keys(warp.options)).toEqual(['up', 'down', 'none']);
        expect(warp.press('down')).toEqual({ command: 'warpDown', args: {}, value: true });
        expect(warp.press('none')).toBeUndefined();
    });

    it('offers only commands the station has, and none of the excluded ones', () => {
        const ids = [
            ...controlsById(helmsDisplay, {
                commands: [{ command: 'boost' }, { command: 'fireTube', count: 2 }],
            }).keys(),
        ];
        expect(ids).toEqual(['boost']);
    });

    it('expands per gun and per system', () => {
        const display: Display = {
            panels: {
                'gun-status': [{ index: 0, loadAmmo: true }],
                'full-systems-status': [
                    { pointer: '/reactor', power: 0.5, coolantFactor: 1 },
                    { pointer: '/radars/0', power: 1, coolantFactor: 0 },
                ],
            },
        };
        const controls = controlsById(display, {
            commands: [
                { command: 'fireChainGun', count: 1 },
                { command: 'loadChainGun', count: 1 },
                { command: 'systemPower', systems: ['/reactor', '/radars/0'] },
            ],
        });
        expect([...controls.keys()]).toEqual([
            'fireChainGun:0',
            'loadChainGun:0',
            'systemPower:/reactor',
            'systemPower:/radars/0',
        ]);
        expect(controls.get('fireChainGun:0')!.press('fire')).toEqual({
            command: 'fireChainGun',
            args: { index: 0, seconds: 0.5 },
            value: undefined,
        });
        expect(controls.get('loadChainGun:0')!.press('on')).toBeUndefined();
        expect(controls.get('loadChainGun:0')!.rest).toBe('on');
        expect(controls.get('systemPower:/reactor')!.press('raise')).toEqual({
            command: 'systemPower',
            args: { system: '/reactor' },
            value: 0.75,
        });
        expect(controls.get('systemPower:/radars/0')!.press('raise')).toEqual({
            command: 'systemPower',
            args: { system: '/radars/0' },
            value: 1,
        });
    });
});

describe('brain request', () => {
    const spec = brainSpecSchema.parse({
        id: 'helms',
        version: 1,
        station: 'helms',
        model: 'jev-1.13.0',
        decisionSeconds: 0.5,
        role: 'pilot',
        mission: 'close in',
        controls: {
            boost: { instructions: 'How hard to push forward?', options: { forward: 'speed up', nonsense: 'ignored' } },
            dock: { skip: true },
        },
        hide: ['radar'],
    });

    it('asks one choice per control over the whole display, applying the brain wording', () => {
        const controls = stationControls({ display: helmsDisplay, capabilities: helmsCapabilities, burstSeconds: 0.5 });
        const request = buildRequest(spec, helmsDisplay, controls);
        expect(Object.keys(request.questions)).not.toContain('dock');
        expect(request.questions.boost.instructions).toBe('How hard to push forward?');
        expect(request.questions.boost.criteria.forward).toBe('speed up');
        expect(request.questions.boost.criteria).not.toHaveProperty('nonsense');
        expect(request.state.display).toEqual({ panels: helmsDisplay.panels });
        expect(request.state).toMatchObject({ role: 'pilot', mission: 'close in' });
    });
});
