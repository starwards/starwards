import { BlipTraces, TraceCandidate } from '../src/radar/blips/blip-traces';

const ship = (id: string, x: number, vx: number): TraceCandidate => ({
    id,
    position: { x, y: 0 },
    velocity: { x: vx, y: 0 },
    color: 0xff0000,
});

describe('BlipTraces', () => {
    test('leaves no trace while an object stays visible', () => {
        const traces = new BlipTraces(3000);
        traces.update(0, [ship('a', 0, 10)], () => true);
        traces.update(100, [ship('a', 1, 10)], () => true);
        expect([...traces.sample(100)]).toEqual([]);
    });

    test('an object leaving view leaves a trace that coasts on its last known velocity', () => {
        const traces = new BlipTraces(3000);
        traces.update(0, [ship('a', 100, 10)], () => true);
        traces.update(1000, [ship('a', 999, -50)], () => false);
        const [trace] = traces.sample(2000);
        expect(trace.id).toBe('a');
        expect(trace.position).toEqual({ x: 110, y: 0 });
        expect(trace.fade).toBeCloseTo(1 / 3);
        expect(trace.color).toBe(0xff0000);
    });

    test('a trace expires once the fade time has passed', () => {
        const traces = new BlipTraces(3000);
        traces.update(0, [ship('a', 0, 10)], () => true);
        traces.update(1000, [ship('a', 0, 10)], () => false);
        traces.update(3999, [ship('a', 0, 10)], () => false);
        expect([...traces.sample(3999)]).toHaveLength(1);
        traces.update(4000, [ship('a', 0, 10)], () => false);
        expect([...traces.sample(4000)]).toEqual([]);
    });

    test('fade time is configurable and applies to live traces', () => {
        const traces = new BlipTraces(3000);
        traces.update(0, [ship('a', 0, 0)], () => true);
        traces.update(0, [ship('a', 0, 0)], () => false);
        traces.fadeMs = 500;
        traces.update(500, [ship('a', 0, 0)], () => false);
        expect([...traces.sample(500)]).toEqual([]);
    });

    test('reacquiring the object removes its trace', () => {
        const traces = new BlipTraces(3000);
        traces.update(0, [ship('a', 0, 10)], () => true);
        traces.update(100, [ship('a', 0, 10)], () => false);
        traces.update(200, [ship('a', 0, 10)], () => true);
        expect([...traces.sample(200)]).toEqual([]);
    });

    test('an object removed from the game leaves no trace', () => {
        const traces = new BlipTraces(3000);
        traces.update(0, [ship('a', 0, 10)], () => true);
        traces.update(100, [], () => false);
        expect([...traces.sample(100)]).toEqual([]);
        traces.update(0, [ship('b', 0, 10)], () => true);
        traces.update(100, [ship('b', 0, 10)], () => false);
        traces.update(200, [], () => false);
        expect([...traces.sample(200)]).toEqual([]);
    });
});
