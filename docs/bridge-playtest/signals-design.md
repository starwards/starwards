# Signals station — design intent (user-stated) and gap to current state

This document captures the user's verbal description of the signals
station's intended role and mechanics, structures it as a design
specification, then compares it against current code and against existing
planned tasks.

## 1. Design intent

### 1.1 Role on the bridge

The signals officer is the bridge's **long-range eye**. Their two jobs:

1. **Threat identification & situational awareness** — using the longest-
   range radar on the bridge, detect, classify, and prioritize incoming
   contacts.
2. **Eyes for the weapons officer** — feed the weapons officer enough
   information to select targets and attack them effectively. This
   includes both *which* target to engage and *how*.

### 1.2 Player-facing capabilities

| # | Capability | Purpose |
|---|---|---|
| C1 | Long-range radar with zoom | Detect contacts beyond weapons-radar range |
| C2 | Target selection | Pick a contact to investigate / pass to weapons |
| C3 | Scan a target — **active mini-game** | Reveal the target's ship model and additional intelligence used for attack planning |
| C4 | Read scan results (model + intel) | Decide which target the weapons officer should attack and how |
| C5 | Cyber attack on a selected target's system | Disable one of the target's systems for a **short period** |

### 1.3 Scan loop

1. Officer selects a target on the long-range radar
2. Officer **initiates a scan** — a mini-game runs (skill-based,
   officer-driven, not just a timer)
3. On success, scan level advances → reveals ship model and additional
   intel (intel content TBD; user said "some intelligence … to decide on
   the most [effective] attack")
4. Result becomes visible on signals station and is implicitly available
   to weapons (target identification gates what weapons sees)

### 1.4 Cyber attack loop

1. Officer selects a target
2. Officer selects which of the target's systems to attack
3. Officer initiates the cyber attack (mini-game form TBD by user; not
   stated)
4. On success, target's chosen system is disabled for a short period
5. Effect is visible to the target's engineering station

### 1.5 Open / unstated by user

- Whether scanning has multiple levels (basic vs deep) or one binary
  "scanned / not scanned"
- The exact mini-game mechanic (rhythm, frequency-tuning, pattern-match,
  etc.)
- Whether cyber attack requires prior scan
- Whether scans / cyber attacks consume resources (energy, coolant)
- Whether multiple scans/attacks can be queued or whether one runs at a
  time
- Track job (keep target visible through obstacles) — not mentioned

## 2. Current state in code (delta to intent)

Source of facts: `docs/bridge-playtest/signals.md`. Tabular delta:

| Capability | Today | Gap |
|---|---|---|
| C1 long-range radar with zoom | ✅ `longRangeRadar` widget, 50km default, presets up to 250km, mouse wheel + header + `=`/`-` keys | none |
| C2 target selection | ✅ `]` / `[` cycle, `'` clear; client-side `SelectionContainer` (independent of `/weaponsTarget`) | filters not implemented (unknown-only / enemy-only) |
| C3 scan as mini-game | 🟡 the scan-job queue is auto-managed (#1992): `SignalsJobManager` appends a job for every visible contact below the top tier and works the first workable one, promoting a tier per `scanBaseDuration` (5s) of unbroken line of sight. Deterministic — no roll. The `signalsJobs` widget is wired into the signals station, so the officer's levers are prioritize and pause-all, not submission | no mini-game form exists yet; the interaction is queue ordering rather than a skill/attention mechanic |
| C4 read scan results | 🟡 radar blip rendering is gated by scan level (`fc54991`/#1205): UFO = gray dot, BASIC/ADVANCED = sprite + ID. **`targetInfo` widget on signals does NOT gate by scan level** — it always shows Type + Faction + Distance + Bearing. No "model" field. No tactical intel for weapons. | scan-level gating in `targetInfo`; add model and intel fields; potentially expose intel to weapons station |
| C5 cyber attack | 🟡 only the **effect side** exists (#1207 closed) — `SystemState.hacked` is a `HackLevel` multiplier in `effectiveness = broken ? 0 : power × hacked`, settable by the GM for a scripted event. **No mechanism and no way for the signals officer to initiate a hack**; tracked by #1899. | the whole initiation side: mechanism, system-selection UI, and whatever interaction model is chosen |

## 3. Comparison with existing planned design / tasks

### 3.1 Tickets

| Ticket | Status | Relation to user intent |
|---|---|---|
| #1204 long-range radar widget | ✅ closed | Delivers C1 |
| #1205 scan levels mechanic | ✅ closed | Delivers the **state model** behind C3/C4 (per-faction scan level on each space object), and the **visibility gating** in radar blips. **Does not** deliver scan progression UX. |
| #1206 signals jobs system | 🟡 core shipped (PR #1878), player UI shipped (#1992) | Delivers the server-side queued-jobs system behind C3 (SignalsJobManager in modules/core, instantiated/ticked in ship-manager-abstract.ts) plus the station's queue widget — as a queued-jobs system, not a mini-game (see §3.2). Scans are auto-queued, so the remaining gap is interaction depth, not wiring. |
| #1207 hack mechanic | ✅ closed | Delivers the effect side of C5 (`hacked` flag on systems). |
| #1208 signals station | ❌ open | Umbrella ticket; lists widgets & hotkeys. **Does not** describe a mini-game; assumes the #1206 jobs flow. |

### 3.2 Conflict with `docs/MS3/SIGNALS_JOBS_DESIGN.md`

The existing design for #1206 specifies **Scan / Hack / Track as queued
auto-executing jobs** — the officer queues a job, it runs on a timer
modified by signals-system effectiveness, and succeeds with a 50–90%
skill-based probability. **This is incompatible with the user's stated
"mini-game" framing.**

Specific conflicts and overlaps:

| Aspect | `SIGNALS_JOBS_DESIGN.md` | User intent |
|---|---|---|
| Scan interaction | Officer queues, then waits 15–60s; success/failure rolled against system effectiveness | Officer plays a mini-game (active interaction) |
| Hack interaction | Same: queue and wait 30–60s; rolled against effectiveness | Implied active flow ("select target, attack one of its systems"); mini-game form unstated |
| Queue size | 9 concurrent jobs | Not addressed; user description sounds single-action |
| Track job | Defined: keep target visible through LOS blocks, max 3 | Not mentioned |
| Hack effect | 50% effectiveness, 2–3 minutes, requires Lvl2 scan | "Disable for a short period" — directionally compatible with hack-effect side; "disable" is stronger than 50% reduction; "short period" may be shorter than 2–3 min |
| Hack pre-requisite | Requires Scan Lvl2 | Not stated by user |
| Per-system targeting | Yes — officer chooses which system | Yes — matches |
| Information for weapons officer | Implicit — Lvl2 reveals systems list, used by signals officer to pick hack target | Explicit — user says intel should help "decide on the most [effective] attack" |

### 3.3 Decision points the user has not yet resolved

These are open because the user's brief is silent on them, not because
the design is incomplete:

- **Replace, modify, or complement `SIGNALS_JOBS_DESIGN.md`?** Mini-game
  vs queued-jobs is the central choice. They can coexist (e.g., scan is
  mini-game, hack is queued) or one displaces the other.
- **What is the mini-game?** Frequency-tuning fits the existing warp-
  frequency UI vocabulary; pattern-match / rhythm / signal-decoding are
  alternatives.
- **One scan flow or two-tier (basic / deep)?** Existing design has two
  levels (Lvl0→Lvl1, Lvl1→Lvl2); user's description sounds single-tier.
- **Does cyber attack need a prior scan?** Existing design says yes
  (Lvl2 required); user did not say.
- **Track / persistent visibility?** Existing design includes Track;
  user did not mention. Drop or keep.
- **Queue vs single-action?** Existing design: 9-job queue. User wording
  implies one-at-a-time.

## 4. Game-readiness summary

Against the user's stated intent, today the signals station delivers
**C1 + C2** fully and **C4 partially** (radar gates by scan level, target-
info panel does not). **C3 and C5 are entirely missing on the signals
seat** — both rely on the GM tweak panel to advance state.

For a bridge playtest where signals is supposed to be the eyes-and-cyber
seat, the effective outcome today is:

- The signals officer can **see further** than weapons and **point at
  things**. Tier-1 identification (UFO→BASIC) now happens automatically
  after 5s of radar dwell (#1925), but the officer
  still cannot **dig deeper** (tier-2) or **interfere with targets**
  without GM intervention.
- The "feed weapons" loop works for basic identification via the tier-1
  auto-promotion; anything beyond BASIC still requires the GM to advance
  scan levels.

## 5. Tickets relevant to closing the gap

- **#1206** open — currently designed as queued jobs, **conflicts with
  user's mini-game framing**. Decision needed before implementation.
- **#1208** open — umbrella; needs widgets + initiation hotkeys for
  whichever interaction model is chosen.
- Any new ticket(s) for: mini-game UI/state machine, per-system hack
  selection UI, `targetInfo` scan-level gating + model/intel fields.
