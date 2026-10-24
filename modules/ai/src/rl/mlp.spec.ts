import { Adam, backward, createMlp, forward, rng } from './mlp';

describe('mlp', () => {
    it('backward matches finite differences', () => {
        const net = createMlp([4, 5, 3, 2], 7, 1);
        const x = [0.3, -0.2, 0.9, 0.1];
        const w = [0.7, -1.3];
        const loss = () => forward(net, x).out.reduce((s, y, i) => s + w[i] * y * y, 0);
        const f = forward(net, x);
        const grad = new Float64Array(net.params.length);
        backward(
            net,
            f,
            f.out.map((y, i) => 2 * w[i] * y),
            grad,
        );
        for (let k = 0; k < net.params.length; k++) {
            const p = net.params[k];
            net.params[k] = p + 1e-6;
            const up = loss();
            net.params[k] = p - 1e-6;
            const down = loss();
            net.params[k] = p;
            expect(grad[k]).toBeCloseTo((up - down) / 2e-6, 5);
        }
    });

    it('Adam fits a small nonlinear function', () => {
        const net = createMlp([2, 16, 16, 1], 1, 1);
        const adam = new Adam(net.params.length);
        const u = rng(3);
        const data = Array.from({ length: 64 }, () => {
            const x = [u() * 2 - 1, u() * 2 - 1];
            return { x, y: Math.sin(2 * x[0]) * x[1] };
        });
        const mse = () => data.reduce((s, d) => s + (forward(net, d.x).out[0] - d.y) ** 2, 0) / data.length;
        const before = mse();
        for (let epoch = 0; epoch < 400; epoch++) {
            const grad = new Float64Array(net.params.length);
            for (const d of data) {
                const f = forward(net, d.x);
                backward(net, f, [(2 * (f.out[0] - d.y)) / data.length], grad);
            }
            adam.step(net.params, grad, 0.01, Infinity);
        }
        expect(mse()).toBeLessThan(before / 10);
    });
});
