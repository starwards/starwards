### Goal

Follow the repo's TDD skill (failing test first), docs/standards/, and the No Tombstones rule (rewrite stale claims, never annotate them).

Background and design intent. The original (pre-#1891) ShipDie cached rolls per id and wiped the cache every ~3 seconds. That window was not incidental — it was a stickiness quantum: a time-stretched phenomenon (e.g. an explosion stream emitting a damage event per tick under one object id) that rolls the same id every tick gets the same answer for the whole window, so its many micro-events cohere into one event-like outcome — the damage concentrates on one victim system instead of sprinkling one-point hits across many — with a rare, legitimate mid-phenomenon switch when it straddles a window boundary. It makes streams behave like events without reifying them as events.

PR #1891 replaced the cache with pure hashing: event rolls (getRoll/getRollInRange/getSuccess) became pure functions of (seed, id) — same id, same value, forever. Determinism was the right call, but eternal freezing was an unintended behavior change: a phenomenon that failed a roll can never succeed on it no matter how long it lingers. The window must come back — deterministically, cheaply, without Math.random().

The fix.

1. Two seeds in ShipDie:
  - private readonly seed: number — immutable for the die's lifetime (constructor arg or random default, as today). Used by drift rolls and as replay identity.
  - private eventSalt: number — initialized from seed, advanced deterministically once per window. Used only by event rolls.
2. Keep private gameTime accumulation in update() (drift needs continuous time). Track the window alongside it: every EVENT_SALT_WINDOW_SECONDS = 3 of accumulated game time, eventSalt = scramble(eventSalt). Use/add a scramble integer-hash step in modules/core/src/logic/hash.ts with proper avalanche (Murmur3-finalizer style); if a suitable function exists there, use it.
3. getRoll(id) = hashToUnit(mix(this.eventSalt, fnv1a(id))). getRollInRange/getSuccess delegate as today. getDrift keeps the immutable seed for channelSeed and gameTime for the noise coordinate — drift channels must NOT jump when the salt rotates.
4. Rewrite the class doc comment to the new contract, including the key-design rule (this is the API's real semantics — state it explicitly):
  - Event rolls are stable within a ~3s game-time window and decorrelate across windows.
  - A caller chooses stickiness through its key: a bare phenomenon id (e.g. pickSystem:${damageId}) is sticky — repeated rolls during a window agree, so a stream coheres onto one outcome; an id carrying a counter/index (e.g. the spillover defect keys defect:{id}:{appIdx}:{system}:{rollIdx} in damage-manager.ts) is fresh — deliberately decorrelated per application, for magnitudes that must accumulate linearly rather than repeat all-or-nothing within a window.
  - Drift rolls: unchanged, continuous, salt-independent.
  - The die remains fully deterministic given (seed, id, update cadence).

Interplay with the damage model (agent/issue-1976 spillover work) — decided, encode as-is:
- Defect success rolls KEEP the per-application counter (appIdx). Do not remove it: within a window, a frozen defect roll would repeat the same success/failure every tick of a stream — machine-gun defects or none — destroying spillover's linear expected-defect rate (amount / 2·damage50), overkill dissipation, and the §9 pins.
- Victim selection (pickSystem:${damage.id}) keeps its bare key ON PURPOSE — with the windowed salt it becomes the sticky mechanism again: a lingering explosion sticks to one victim per window and may re-pick at a boundary. This is desired; do not "fix" it with a counter.
- Net effect after both branches merge: sticky identity (who gets hit) + fresh magnitude (how many defects) — concentration with linearity.

Tests (ship-die.spec.ts — rewrite pins asserting eternal id-stability):
- Same id, no update() between rolls → identical value (within-window stability).
- Same id across several windows (advance via update({deltaSeconds})) → more than one distinct value (decorrelation).
- Replay determinism: two dice, same seed, same update sequence → identical roll sequences for the same ids.
- Drift unaffected by salt rotation: getDrift for a channel at equal gameTime yields equal values regardless of how many rotations occurred; no discontinuity at a boundary beyond the noise function's normal step.
- getSuccess frequency on one repeated id across many windows approaches p (the property eternal freezing destroyed).

Gates: npm test, npm run test:types, npm run test:format, npm run knip. Note: damage-spillover.spec.ts (on agent/issue-1976) has a "repeated applications of one lingering damage id keep rolling fresh dice" test that passes with or without this fix (the counter provides freshness); no changes expected there.

Out of scope: changing the window length (keep the named constant), drift semantics, damage-manager key changes, spec §4 wording (spillover stands as specified).

Pre-existing draft: starwards/modules/core/src/ship/ship-die.ts on agent/issue-1929 has a partial attempt — it scrambles the single shared seed (breaking drift continuity) and references a deleted this.gameTime in getDrift (doesn't compile). Replace it with the above; don't build on it.

### Acceptance criteria

- [ ] getRoll(id) returns the identical value for repeated calls with the same id when no update() occurs between them — unit test.
- [ ] getRoll(id) with the same id returns at least two distinct values when sampled across ≥5 salt windows (advancing game time via update({deltaSeconds})) — unit test.
- [ ] Rolls for the same id are identical on either side of update() calls that do not cross a window boundary (e.g. 10 × 0.1s updates within one 3s window) — unit test.
- [ ] Two ShipDie instances constructed with the same seed and fed an identical update() sequence produce identical values for an identical sequence of getRoll/getSuccess/getRollInRange calls — unit test (replay determinism).
- [ ] getSuccess(id, 0.3) on one fixed id, sampled once per window across ≥200 windows, succeeds at a frequency of 0.3 ± 0.1 — unit test (eternal-freeze regression).
- [ ] getDrift(id) at equal accumulated gameTime returns equal values regardless of how many salt rotations occurred — unit test (drift uses the immutable seed, not the salt).
- [ ] getDrift(id) sampled at small steps across a window boundary shows no step larger than the same-dt steps away from the boundary — unit test (no synchronous drift jump).
- [ ] EVENT_SALT_WINDOW_SECONDS is a single named constant; no other literal encodes the window length — code inspection / grep.
- [ ] scramble in modules/core/src/logic/hash.ts has a unit test showing single-bit input changes flip ~half the output bits on average (avalanche sanity), or reuses an existing already-tested finalizer.
- [ ] The ShipDie doc comment states the window contract and the key-design rule (bare id = sticky per window, counter-bearing id = fresh per application); no remaining claim that event rolls are stable "for the entire lifetime" of an id — doc review.
- [ ] No pre-existing test in ship-die.spec.ts still pins eternal id-stability — test-suite review.
- [ ] Full gate passes: npm test, npm run test:types, npm run test:format, npm run knip — CI.
- [ ] Manual: in a dev game (npm run dev), a GM-spawned lingering explosion overlapping a ship section damages one system per ~3s window (watch the engineering status widget), rather than never damaging a system it initially "missed" — concrete manual step.
- [ ] (Post-merge with agent/issue-1976 only) damage-spillover.spec.ts and armor-layers-examples.spec.ts pass unchanged — CI on the merge branch.

### Affected modules / files

modules/core/src/ship/ship-die.ts (+ modules/core/src/logic/hash.ts, modules/core/test/ship-die.spec.ts).

### Verification command(s)

_No response_

### Context and constraints

_No response_
