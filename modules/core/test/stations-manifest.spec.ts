import { StationEntry, isAssignableSeat } from '../src';

// Issue #2131 review: the GM meta-seat must never compete for a ship slot in auto-assign, even
// if some future manifest change enables it — `isAssignableSeat` is the single choke point.

describe('isAssignableSeat', () => {
    it('accepts an enabled, non-gm seat', () => {
        const entry: StationEntry = { enabled: true };
        expect(isAssignableSeat(entry)).toBe(true);
    });

    it('rejects a disabled seat', () => {
        const entry: StationEntry = { enabled: false };
        expect(isAssignableSeat(entry)).toBe(false);
    });

    it('rejects the gm meta-seat even when enabled', () => {
        const entry: StationEntry = { enabled: true, gm: true };
        expect(isAssignableSeat(entry)).toBe(false);
    });

    it('rejects a missing entry', () => {
        expect(isAssignableSeat(undefined)).toBe(false);
    });
});
