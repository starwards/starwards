import { referenceSeat, referenceSeatPlan } from './reference-crew';

describe('referenceSeatPlan', () => {
    it.each(['helms', 'weapons', 'engineer', 'signals', 'tactical'])('plays %s with its v1 brain', (station) => {
        const plan = referenceSeatPlan(station);
        expect(plan.station).toBe(station);
        expect(plan.spec.station).toBe(station);
        expect(plan.policy.name).toBe('reference');
    });

    it('has no brain for a station without one', () => {
        expect(() => referenceSeatPlan('dradis')).toThrow('no reference brain for station "dradis"');
    });
});

describe('referenceSeat', () => {
    it('plays a brain with the reference policy', () => {
        const { spec } = referenceSeatPlan('weapons');
        const seat = referenceSeat(spec);
        expect(seat).toMatchObject({ station: 'weapons', spec });
        expect(seat.policy.name).toBe('reference');
    });
});
