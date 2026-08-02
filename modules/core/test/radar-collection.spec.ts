import { PowerLevel, ShipArea, getSystems, makeShipState, shipConfigurations } from '../src';

import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

describe('radar collection (I1)', () => {
    it('makeShipState builds a radars collection with at least two radars', () => {
        const state = makeShipState('1', demoShipConfig);
        // ArraySchema-like: indexable + has a numeric length
        expect(state.radars).to.not.equal(undefined);
        expect(state.radars.length).to.be.at.least(2);
        expect(state.radars.at(0)).to.not.equal(undefined);
        expect(state.radars.at(1)).to.not.equal(undefined);
    });

    it('radars[0] is the 360 omni radar', () => {
        const state = makeShipState('1', demoShipConfig);
        const omni = state.radars[0];
        expect(omni.design.range).to.be.a('number').and.to.be.greaterThan(0);
        expect(omni.design.area).to.be.a('number');
        expect(omni.arc).to.equal(360);
        expect(omni.design.minArc).to.equal(360);
        expect(omni.design.maxArc).to.equal(360);
        expect(omni.design.defaultArc).to.equal(360);
    });

    it('radars[1] is the steerable directional scan-beam radar', () => {
        const state = makeShipState('1', demoShipConfig);
        const beam = state.radars[1];
        expect(beam.arc).to.be.a('number').and.to.be.lessThan(360);
        // steerable direction
        expect(beam.bearing).to.be.a('number');
        const original = beam.bearing;
        beam.bearing = original + 30;
        expect(beam.bearing).to.equal(original + 30);
        // narrower-than-widest design envelope
        expect(beam.design.minArc).to.be.lessThan(beam.design.maxArc);
    });

    it('every radar is a SystemState (power/effectiveness/broken)', () => {
        const state = makeShipState('1', demoShipConfig);
        for (const radar of state.radars) {
            expect(radar.power).to.equal(PowerLevel.NORMAL);
            expect(radar.effectiveness).to.be.a('number');
            expect(radar.broken).to.be.a('boolean');
        }
    });

    it('getSystems discovers both radars at /radars/0 and /radars/1', () => {
        const state = makeShipState('1', demoShipConfig);
        const pointers = getSystems(state).map((s) => s.pointer);
        expect(pointers).to.include('/radars/0');
        expect(pointers).to.include('/radars/1');
    });

    it('systemsByAreas(front) enumerates BOTH radar instances', () => {
        const state = makeShipState('1', demoShipConfig);
        const frontSystems = state.systemsByAreas(ShipArea.front);
        expect(frontSystems).to.include(state.radars[0]);
        expect(frontSystems).to.include(state.radars[1]);
        // and the aggregate systems() view sees both too
        const allSystems = state.systems();
        expect(allSystems).to.include(state.radars[0]);
        expect(allSystems).to.include(state.radars[1]);
    });
});
