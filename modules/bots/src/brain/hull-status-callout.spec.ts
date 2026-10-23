import { CALLOUT_QUESTION, calloutSaid, hullStatusChange } from './callout';
import { calloutMemory, referenceCallout } from './reference-orders';

import { BrainRequest } from './request';
import { BrainSpec } from './spec';
import { Display } from './controls';
import { HullStatus } from '@starwards/core/internal';

type Row = Pick<HullStatus, 'id' | 'allied' | 'intel' | 'capsule'>;

/** A signals display: the own ship (faction 1) at the origin, its hull-status panel, and radar contacts. */
function shown(rows: Row[], contacts: { id: string; faction: number; x: number; radius?: number }[] = []): Display {
    return {
        panels: { 'hull-status': rows.map((r) => ({ name: r.id, hullPercent: 60, ...r })) },
        radar: {
            ownShip: { id: 'own', heading: 0, faction: 1, position: { x: 0, y: 0 } },
            contacts: contacts.map((c) => ({
                id: c.id,
                name: c.id,
                scanLevel: 'FULL',
                type: 'Spaceship',
                faction: c.faction,
                radius: c.radius ?? 11,
                distance: Math.abs(c.x),
                bearing: 0,
                position: { x: c.x, y: 0 },
            })),
        },
    };
}

const live = (id: string, capsule: HullStatus['capsule'], allied = false): Row => ({
    id,
    allied,
    intel: 'LIVE',
    capsule,
});

describe('hullStatusChange', () => {
    it('reports nothing without a change', () => {
        const d = shown([live('a', 'intact', true)]);
        expect(hullStatusChange(d, d)).toBeUndefined();
    });

    it('an ally comes before an enemy', () => {
        const before = shown([live('e', 'intact'), live('a', 'intact', true)]);
        const now = shown([live('e', 'damaged'), live('a', 'critical', true)]);
        expect(hullStatusChange(now, before)?.id).toBe('a');
    });

    it('a contact attacking an allied station comes before another contact', () => {
        const contacts = [
            { id: 'station', faction: 1, x: 10_000, radius: 300 },
            { id: 'far', faction: 2, x: -20_000 },
            { id: 'attacker', faction: 2, x: 11_000 },
        ];
        const before = shown([live('far', 'intact'), live('attacker', 'intact')], contacts);
        const now = shown([live('far', 'damaged'), live('attacker', 'damaged')], contacts);
        expect(hullStatusChange(now, before)?.id).toBe('attacker');
    });

    it('a snapshot never triggers, nor does a row that turns live', () => {
        const snap = (capsule: HullStatus['capsule']): Row => ({ id: 's', allied: false, intel: 'SNAPSHOT', capsule });
        expect(hullStatusChange(shown([snap('failing')]), shown([snap('intact')]))).toBeUndefined();
        expect(hullStatusChange(shown([live('s', 'failing')]), shown([snap('intact')]))).toBeUndefined();
    });
});

describe('hull_status callout', () => {
    const spec = {
        decisionSeconds: 1,
        controls: {},
        callouts: {
            hull_status: { say: '{who} {name} capsule {tier}, hull {hull}%', when: '', fill: 'hullStatusChange' },
            enemy_position: { say: 'enemy', when: '' },
        },
    } as unknown as BrainSpec;
    const request = {
        state: {},
        questions: {
            [CALLOUT_QUESTION]: {
                type: 'choice',
                instructions: '',
                criteria: { hull_status: '', enemy_position: '', silence: '' },
            },
        },
    } as BrainRequest;

    it('is heard as "ally X capsule critical"', () => {
        const before = shown([live('station', 'damaged', true)]);
        const now = shown([live('station', 'critical', true)]);
        expect(calloutSaid(spec, 'hull_status', now, CALLOUT_QUESTION, before)?.phrase).toBe(
            'ally station capsule critical, hull 60%',
        );
    });

    it('says at most one hull-status callout per window, dropping the changes inside it', () => {
        const state = calloutMemory();
        const tiers = ['intact', 'damaged', 'critical', 'failing'] as const;
        const said: string[] = [];
        let previous = shown([live('a', 'intact', true)]);
        for (let i = 1; i <= 6; i++) {
            const now = shown([live('a', tiers[i % 4], true)]);
            said.push(referenceCallout(request, now, previous, 1, undefined, { state })?.choice ?? '');
            previous = now;
        }
        expect(said.filter((c) => c === 'hull_status')).toHaveLength(2);
        expect(said[0]).toBe('hull_status');
        expect(said[5]).toBe('hull_status');
    });
});
