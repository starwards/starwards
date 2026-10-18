import { RepairPriority, orderRepairQueue } from '../src/ship/repair-queue';
import { expect } from 'chai';

const s = (id: string, priority: RepairPriority, queuedSeq: number) => ({ id, priority, queuedSeq });

describe('orderRepairQueue (#2434)', () => {
    it('drops OFF slots', () => {
        expect(orderRepairQueue([s('a', RepairPriority.OFF, 0)])).to.eql([]);
    });

    it('active first, then priority descending, then queuedSeq ascending', () => {
        const ordered = orderRepairQueue([
            s('low1', RepairPriority.LOW, 1),
            s('high5', RepairPriority.HIGH, 5),
            s('cancel', RepairPriority.CANCELLING, 2),
            s('high3', RepairPriority.HIGH, 3),
            s('med9', RepairPriority.MEDIUM, 9),
            s('off', RepairPriority.OFF, 0),
        ]);
        expect(ordered.map((x) => x.id)).to.eql(['cancel', 'high3', 'high5', 'med9', 'low1']);
    });

    it('full ties keep input (catalog) order', () => {
        const ordered = orderRepairQueue([s('b', RepairPriority.LOW, 0), s('a', RepairPriority.LOW, 0)]);
        expect(ordered.map((x) => x.id)).to.eql(['b', 'a']);
    });

    it('does not mutate its input', () => {
        const input = [s('a', RepairPriority.LOW, 2), s('b', RepairPriority.LOW, 1)];
        orderRepairQueue(input);
        expect(input.map((x) => x.id)).to.eql(['a', 'b']);
    });
});
