/**
 * Seed banks of the waves search. Tuning (hand levers, CMA-ES generations, 32-seed screens) uses
 * only `TUNING_SEEDS`; a candidate is promoted on `HELD_OUT_SEEDS`, which tuning never sees. Both are
 * contiguous, so a CLI takes them as `--first-seed <first> --seeds <count>` (cluster: `FIRST_SEED`,
 * 16-seed shards).
 */
export const TUNING_SEEDS = { first: 1, count: 64 } as const;
export const HELD_OUT_SEEDS = { first: 1001, count: 128 } as const;

export type SeedBank = { readonly first: number; readonly count: number };

export const seedList = ({ first, count }: SeedBank) => Array.from({ length: count }, (_, i) => first + i);
