# Coverage strategy

Where test coverage is thin today, and how the coverage gate moves. The commands themselves are
in [README.md](README.md); this note is only about what to cover next and how hard the gate bites.

## Core kernel test backfill

The highest-risk source files have thin or no dedicated test coverage:

| File                   | LOC | Tests today        | What to cover                                                                                 |
| ---------------------- | --- | ------------------ | --------------------------------------------------------------------------------------------- |
| `space-manager.ts`     | 997 | 2 files (58 tests) | `setPosition`/`updateAABB` ordering; MapSchema delete semantics                               |
| `movement-manager.ts`  | 451 | 1 file (13 tests)  | Dock alignment, additional thrust-vector edge cases (thrust/strafe/brake/afterburner covered) |
| `chain-gun-manager.ts` | 313 | 1 file (13 tests)  | Cooldown, jam, reload state machine (ammo decrement/switching covered)                        |

E2E gaps: a Playwright equivalent of the two-clients-on-same-ship scenario (one writes a `@commandable` property, the other observes). This scenario already has server-side coverage in `modules/server/src/test/multi-client-sync.spec.ts`; only a browser-level E2E remains outstanding.
