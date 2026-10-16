import { loadCrew } from './crew-config';
import path from 'node:path';

const crewFile = (name: string) => path.resolve(__dirname, '../../crews', `${name}.json`);

describe('a crew around a human seat', () => {
    it('seats every station of the crew but the human one', () => {
        const crew = loadCrew(crewFile('reference-signals'), undefined, 'helms');
        expect(crew.seats.map((s) => s.station)).toEqual(['weapons', 'engineer', 'signals']);
    });

    it('seats the whole crew when the human takes a station it does not play', () => {
        const crew = loadCrew(crewFile('reference-signals'), undefined, 'relay');
        expect(crew.seats.map((s) => s.station)).toEqual(['helms', 'weapons', 'engineer', 'signals']);
    });

    it('refuses a fused seat that would play the human station', () => {
        expect(() => loadCrew(crewFile('tactical-reference'), undefined, 'weapons')).toThrow(/tactical/);
    });

    it('needs no Jev key when the only Jev seat is the human one', () => {
        const key = process.env.TYPESAFE_API_KEY;
        delete process.env.TYPESAFE_API_KEY;
        try {
            const crew = loadCrew(crewFile('jev-weapons-w17-ref-helms'), undefined, 'weapons');
            expect(crew.seats.map((s) => s.station)).toEqual(['helms']);
            expect(crew.usesJev).toBe(false);
        } finally {
            if (key !== undefined) {
                process.env.TYPESAFE_API_KEY = key;
            }
        }
    });
});
