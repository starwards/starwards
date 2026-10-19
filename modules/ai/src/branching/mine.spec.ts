import { mine, mineReport } from './mine';

import { BranchRow } from './corpus';

function row(seed: number, killed: number, kills: number): BranchRow {
    return {
        seed,
        level: 'tactical',
        t: 10,
        reasons: [],
        taken: 'close_to',
        alternative: 'engage@x',
        kind: 'engage@other',
        state: { enemies: 2, stations: [], orders: '' },
        outcome: {} as BranchRow['outcome'],
        baseline: { killed: false, seconds: 100, kills: 1, value: 0.5 },
        delta: { value: 0.1 * killed, kills, killed, seconds: null },
        prefixMatches: true,
    } as unknown as BranchRow;
}

describe('mine', () => {
    it('counts runs passed (killed) gained and lost per finding, beside kills', () => {
        const rows = [row(1, 1, 2), row(2, 0, -1), row(3, -1, 0), row(4, 1, 0)];
        rows.forEach((r) => ((r.outcome as { value: number }).value = 0.5 + (r.delta.value ?? 0)));
        const [all] = mine(rows).filter((f) => f.feature === 'all');
        expect(all).toMatchObject({ passUp: 2, passDown: 1, killsUp: 1, killsDown: 1 });
        expect(mineReport(rows, mine(rows))).toContain('| kills gained / lost | runs won gained / lost |');
    });
});
