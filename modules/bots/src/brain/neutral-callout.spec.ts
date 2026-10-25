import { Contact, Radar } from './verbal';
import { BrainSpec } from './spec';
import { Display } from './controls';
import { Faction } from '@starwards/core/internal';
import { calloutSaid } from './callout';
import { focusTarget } from '../crew/orders';
import { isEnemyShip } from './enemy';
import { nearestEnemy } from './engagement';

const ship = (id: string, faction: number | undefined, distance: number): Contact => ({
    id,
    name: id,
    scanLevel: 'BASIC',
    type: 'Spaceship',
    faction,
    distance,
    bearing: 0,
    position: { x: distance, y: 0 },
});

/** Own ship Gravitas at the origin; a neutral hull nearer than a Raider. */
const ownShip = { id: 'me', heading: 0, position: { x: 0, y: 0 }, faction: Faction.Gravitas };
const seen = (...contacts: Contact[]): Display => ({ panels: {}, radar: { ownShip, contacts } satisfies Radar });
const display = seen(ship('hulk', Faction.NONE, 1000), ship('raider', Faction.Raiders, 5000));
const neutralOnly = seen(ship('hulk', Faction.NONE, 1000));

const spec = (fill: string) =>
    ({ decisionSeconds: 5, callouts: { c: { say: '{name}', when: '', fill } } }) as unknown as BrainSpec;

describe('an identified neutral (Faction.NONE) is no enemy', () => {
    it('is skipped by nearestEnemy in favour of a real enemy', () => {
        expect(nearestEnemy(display.radar as never)?.id).toBe('raider');
        expect(nearestEnemy(neutralOnly.radar as never)).toBeUndefined();
    });

    it.each(['enemyContact', 'engageOrder', 'closeOrder'])(
        '%s names the raider, and nothing for a lone neutral',
        (fill) => {
            expect(calloutSaid(spec(fill), 'c', display)?.values?.name).toBe('raider');
            expect(calloutSaid(spec(fill), 'c', neutralOnly)).toBeUndefined();
        },
    );

    it('focusOrder lists only real enemies', () => {
        expect(calloutSaid(spec('focusOrder'), 'c', display)?.values?.names).toBe('raider');
        expect(calloutSaid(spec('focusOrder'), 'c', neutralOnly)).toBeUndefined();
    });

    it('lostContact does not report a vanished neutral', () => {
        const gone = seen();
        expect(calloutSaid(spec('lostContact'), 'c', gone, 'callout', neutralOnly)).toBeUndefined();
    });

    it('isEnemyShip rejects neutral, own, unidentified and non-ship contacts', () => {
        expect(isEnemyShip({ type: 'Spaceship', faction: Faction.Raiders }, Faction.Gravitas)).toBe(true);
        expect(isEnemyShip({ type: 'Spaceship', faction: Faction.NONE }, Faction.Gravitas)).toBe(false);
        expect(isEnemyShip({ type: 'Spaceship', faction: Faction.Gravitas }, Faction.Gravitas)).toBe(false);
        expect(isEnemyShip({ type: 'Spaceship' }, Faction.Gravitas)).toBe(false);
        expect(isEnemyShip({ type: 'Asteroid', faction: Faction.Raiders }, Faction.Gravitas)).toBe(false);
    });

    it('focusTarget never focuses a neutral', () => {
        expect(focusTarget({ targets: [{ name: 'hulk' }] }, display)).toBeUndefined();
        expect(focusTarget({ pick: 'fastest_closing' }, display)?.name).toBe('raider');
        expect(focusTarget({ pick: 'fastest_closing' }, neutralOnly)).toBeUndefined();
    });
});
