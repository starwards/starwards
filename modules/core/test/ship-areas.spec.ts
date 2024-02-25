import { EPSILON, FRONT_ARC, REAR_ARC, ShipArea, shipAreasInRange, toPositiveDegreesDelta } from '../src';
import { float, range } from './properties';

import { expect } from 'chai';
import fc from 'fast-check';

const FRONT_ARC_TEST = [FRONT_ARC[0] + EPSILON, FRONT_ARC[1] - EPSILON] as const;
const REAR_ARC_TEST = [REAR_ARC[0] + EPSILON, toPositiveDegreesDelta(REAR_ARC[1]) - EPSILON] as const;

describe('shipAreasInRange', () => {
    it('detects front-only range', () =>
        fc.assert(
            fc.property(range(...FRONT_ARC_TEST), (arc: [number, number]) => {
                const areas = [...shipAreasInRange(arc)];
                expect(areas).to.deep.equal([ShipArea.front]);
            }),
        ));
    it('detects rear-only range', () =>
        fc.assert(
            fc.property(range(...REAR_ARC_TEST), (arc: [number, number]) => {
                const areas = [...shipAreasInRange(arc)];
                expect(areas).to.deep.equal([ShipArea.rear]);
            }),
        ));
    it('detects combined range from front to rear', () =>
        fc.assert(
            fc.property(float(...FRONT_ARC_TEST), float(...REAR_ARC_TEST), (from, to) => {
                const arc = [from, to] as const;
                const areas = [...shipAreasInRange(arc)];
                expect(areas).to.deep.equal([ShipArea.front, ShipArea.rear]);
            }),
        ));
    it('detects combined range from rear to front', () =>
        fc.assert(
            fc.property(float(...REAR_ARC_TEST), float(...FRONT_ARC_TEST), (from, to) => {
                const arc = [from, to] as const;
                const areas = [...shipAreasInRange(arc)];
                expect(areas).to.deep.equal([ShipArea.front, ShipArea.rear]);
            }),
        ));
    it('detects combined range from front to front', () =>
        fc.assert(
            fc.property(range(...FRONT_ARC_TEST), ([to, from]: [number, number]) => {
                const arc = [from, to] as const; // reverse order
                const areas = [...shipAreasInRange(arc)];
                expect(areas).to.deep.equal([ShipArea.front, ShipArea.rear]);
            }),
        ));
    it('detects combined range from rear to rear', () =>
        fc.assert(
            fc.property(range(...REAR_ARC_TEST), ([to, from]: [number, number]) => {
                const arc = [from, to] as const; // reverse order
                const areas = [...shipAreasInRange(arc)];
                expect(areas).to.deep.equal([ShipArea.front, ShipArea.rear]);
            }),
        ));
});
