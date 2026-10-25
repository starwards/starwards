/**
 * Experiment knobs for measuring which randomness source makes a seed's outcome unrepeatable
 * once anything upstream shifts (card M4.78). Default: nothing pinned, play is unchanged.
 *
 * A pinned source draws from a stream keyed only on the run seed and stable keys (wave number,
 * shooter id, shot number) instead of on event order, global id counters or the 3 s event-salt
 * window. Names:
 *  - `spawn`   wave spawn point, jitter and composition: one stream per wave, not one shared sequence
 *  - `ids`     raider, shell and explosion ids derive from (wave, index) / (shooter, shot) instead of the global counters
 *  - `salt`    die event rolls use the run seed alone, not the window-rotated event salt
 *  - `aim`     only the aim-spread rolls take the `salt` treatment
 *  - `damage`  only the system-pick rolls take the `salt` treatment
 *  - `defect`  only the defect rolls (probability, effects) take the `salt` treatment
 *  - `cadence` only the coolant phase roll takes the `salt` treatment
 *  - `aggro`   raider aggro-character noise off (factors fixed at 1)
 *  - `all`     every name above
 */
export const RNG_PIN_NAMES = ['spawn', 'ids', 'salt', 'aim', 'damage', 'defect', 'cadence', 'aggro'] as const;
export type RngPinName = (typeof RNG_PIN_NAMES)[number];

let pinned: ReadonlySet<string> = new Set();

/** Parses a comma list (`aim,spawn`, `all`, empty) and makes it the active pin set. Throws on an unknown name. */
export function setRngPin(spec: string | undefined) {
    const names = (spec ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const next = new Set<string>();
    for (const name of names) {
        if (name === 'all') {
            RNG_PIN_NAMES.forEach((n) => next.add(n));
        } else if ((RNG_PIN_NAMES as readonly string[]).includes(name)) {
            next.add(name);
        } else {
            throw new Error(`unknown RNG pin '${name}'; known: ${RNG_PIN_NAMES.join(', ')}, all`);
        }
    }
    pinned = next;
}

export function isRngPinned(name: RngPinName): boolean {
    return pinned.has(name);
}
