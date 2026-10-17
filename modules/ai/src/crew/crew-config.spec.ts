import { loadCrew } from './crew-config';
import path from 'node:path';
import { referenceSeatPlan } from '@starwards/bots';

const crewFile = (name: string) => path.resolve(__dirname, '../../crews', `${name}.json`);

describe('the curriculum reference crew', () => {
    it('seats exactly the reference seats @starwards/bots builds', () => {
        const crew = loadCrew(crewFile('reference'));
        for (const seat of crew.seats) {
            const reference = referenceSeatPlan(seat.station);
            expect(seat.spec).toEqual(reference.spec);
            expect(seat.policy.name).toBe(reference.policy.name);
        }
    });
});
