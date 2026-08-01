import { System } from '@starwards/core';

type BrokenSystemInfo = { pointer: string; name: string };

export function getBrokenSystems(systems: readonly System[]): BrokenSystemInfo[] {
    return systems.filter((s) => s.state.broken).map((s) => ({ pointer: s.pointer, name: s.state.name }));
}
