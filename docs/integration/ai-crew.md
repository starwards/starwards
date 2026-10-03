---
audience: both
depth: deep
source_of_truth:
    - modules/ai
    - modules/mcp/src/sandbox/console.ts
    - modules/server/src/test/training/training-scenarios.ts
    - modules/core/src/recording/recording-format.ts
related:
    - mcp-server.md
    - ../../modules/server/src/test/training/README.md
last_verified: 2026-10-02
---

# AI crew (station brains)

**Module:** [`modules/ai`](../../modules/ai) — station brains that play a ship by pressing the buttons
of one station each, and the harness that trains and measures them in the headless game.

## Purpose and seat policy

Owner decisions (Amir, 2026-10-03):

- Bots serve three uses: NPC crews in the game, filling empty seats at playtests, and a balance and
  evaluation harness.
- Each seat gets the best player for it by paired test: `reference` rules ($0) where they win, a Jev
  brain only where it beats them.
- Weapons seat: `reference`. Jev weapons v17 with reference helms against all-reference, T1-lite seeds
  17–48: 28/32 vs 29/32, run value 0.765 vs 0.777, sign p 1.00; L0 T0 7/8 vs 8/8. No paired win.
- Engineer seat: `reference` (cools the gun and keeps energy up; without it T1 is 0/16).
- `T1` must become winnable by bots. The reference crew (helms, weapons, engineer) wins 5/16.
- Jev budget: $25.

## What a brain is

A brain plays one station. At every decision it is shown everything that station's console displays
(and, on a crew, what the other seats said lately — see [Crew talk](#crew-talk)), and for every control
the console has it picks one of the buttons that control physically offers:

| Control kind        | Options                                                 | Example                                        |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| axis                | one step each way, no press, centre                     | strafe: `right` / `left` / `hold` / `centre`   |
| held key            | `engage` / `release`                                    | afterburner, anti-drift, breaks                |
| momentary key       | `press` / `wait`                                        | rotation mode, dock                            |
| exclusive keys      | one of them, or `none`                                  | target: `next` / `previous` / `clear` / `none` |
| switch              | `on` / `off`                                            | target filters, gun loading                    |
| trigger             | `fire` (a burst of one decision interval) / `hold_fire` | chain gun                                      |
| per repair protocol | `raise` / `lower` / `none`, `switch_mode` / `none`      | repair queue                                   |

Per-gun and per-system controls are expanded (`fireChainGun:0`, `systemPower:/reactor`). The whole
catalogue, one entry per station command, is [`catalogue.ts`](../../modules/ai/src/brain/catalogue.ts);
commands left out carry their reason there (tubes cannot fire through the sandbox; signals job
commands send no job id; waypoint commands are not buttons).

All of a decision's questions go to [Jev](https://docs.typesafe.ai) in one request: `state` is the
display, plus the brain's `role` and `mission`; each control is one choice question. Code turns the
answers into console commands.

**A brain is one data file**, [`modules/ai/brains/<station>.v<N>.json`](../../modules/ai/brains):
model, decision interval, confidence floor, role, mission, per-control wording overrides, controls to
skip and display parts to hide. Tuning a brain means writing its next version; the code is shared by
every brain and every host.

Policies answer a brain's questions: `jev`, `reference` (hand-written rules for helms and weapons —
the harness's positive control: it shows a kill is reachable through the buttons) and `idle` (presses
nothing — the negative control).

## Same console as a live seat

Brains read and press through the MCP station sandbox itself
([`sandbox/console.ts`](../../modules/mcp/src/sandbox/console.ts), `StationSession`): in the headless
game, [`console/headless.ts`](../../modules/ai/src/console/headless.ts) seats a real `StationSession`
on in-process drivers that apply the same JSON-pointer handler and typed commands the rooms do, on
simulated time. A brain therefore sees exactly the fog of war a live MCP seat sees.

## Verbal UI

A brain with `"view": "verbal"` in its brain file reads the console as sentences instead of data:
[`brain/verbal.ts`](../../modules/ai/src/brain/verbal.ts) has one template per station panel plus one
for the radar, and the request carries those lines as `console` instead of `display`. Jev is weak at
comparing raw numbers (bearing against heading, this distance against the last one), so code reads
the display out as an officer would ("12° right of the nose, closing at 40 m/s", "(LOCKED)", "1 of 3
station systems working normally") and the brain keeps only the judgement. The reader remembers the
previous reading to say whether contacts close, open or hold. The templates read only what the
display shows, so the fog of war is unchanged.

## What-if forecasts

Owner's idea: instead of leaving Jev to compare raw numbers, code roughly simulates each option of a
control and writes the consequence into that option. A control's wording in the brain file names a
plug-in, `"whatIf": "tailGeometry"`; a brain version without it is unchanged. The plug-in interface
is [`whatif/whatif.ts`](../../modules/ai/src/whatif/whatif.ts): given the station's display, the
display at the previous decision (a seat remembers its own screen, as the verbal reader does), a
control and one of its options, a `WhatIf` returns a sentence and optionally an indicator value
(higher is better, comparable only within one control), or nothing when the display does not show
enough. [`whatif/forecast.ts`](../../modules/ai/src/whatif/forecast.ts) asks the plug-in about every
option, appends each sentence to that option's description, and marks the option with the highest
indicator `Best forecast of these options.` (a tie goes to pressing nothing): the comparison is made
in code. The option a plug-in is asked about is turned into a setting by the control's own `press`,
so a forecast is always of the key the console would send.

| Plug-in         | Controls                         | Says                                                                                                                             | Indicator                               |
| --------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `tailGeometry`  | helms boost, strafe, afterburner | "In 4 s: contact 620 m away, 3° left of the nose, firing position 180 m off (reached in 9 s)."                                   | nearer the firing position in 4 s       |
| `noseOnContact` | helms rotation (mode VELOCITY)   | "In 3 s: contact 74° right of the nose."                                                                                         | nearer the nose in 3 s                  |
| `gunLine`       | weapons trigger                  | "The locked target is 40 m off the gun line now and 60 m off the gun line in 1 s (a blast reaches 100 m): shells fired now hit." | fire only if on the line now and in 1 s |
| `energyHeat`    | engineer power, coolant          | "In 10 s: energy store 450 of 1000, this system's heat 15 of 100."                                                               | none: the trade-off is the engineer's   |

The kinematics are simple and read only the display. Helms flies on the nearest ship-sized contact
of its own radar, whose velocity is its change of position between two displays; the commanded
speed or turn rate is taken as reached at once (the smart pilot gets there inside a quarter of a
second); in maneuvering TARGET the command rides on the contact's velocity, in rotation TARGET the
nose stays on the contact. The firing position is 500 m behind the contact's motion (any side of a
still contact). Minimising the distance to it 4 s ahead is a proportional controller: a setting
that would fly past the position scores worse than a gentler one. The engineer's rates are the
change of the energy store and of a system's heat between two displays plus each system's displayed
energy per minute. Each plug-in file names the ship constants it assumes the officer knows (top
speed, afterburner speed, turn rate, shell reach, coolant): they are the GVTS's, as in the reference
policy.

The snapshot scorer ([Snapshot scoring](#snapshot-scoring)) is not used as the indicator: it takes a
whole `SavedGame`, and its features need what a station does not show (the target's systems and
ammunition, every own system for the helms model, the weapons lock for helms). Building a frame from
one station's display would either leak state or feed the models invented values, so the indicators
are computed from the display alone.

Benchmarks, seeds 1–6, 2 workers, policy jev, every station radar cut to its reach (helms 5 km;
`helms-intercept` spawns 3–6 km, so some of its seeds start beyond the helms radar for both brains):

| Benchmark         | Current best                    | What-if                          | Cost (both)    |
| ----------------- | ------------------------------- | -------------------------------- | -------------- |
| `helms-tag`       | helms v16 0.77                  | helms v19 0.88                   | $0.111 + 0.128 |
| `helms-hold`      | helms v16 0.57                  | helms v19 0.82                   | $0.074 + 0.086 |
| `helms-intercept` | helms v16 0.65                  | helms v19 0.71                   | $0.038 + 0.034 |
| `weapons-range`   | weapons v15 89.7 (8.3 off line) | weapons v17 135.9 (2.8 off line) | $0.035 + 0.033 |

Crew `jev-whatif-h19-w17-e10-s3` (recommended with helms v19 and weapons v17) on T1-lite seeds 1–6,
180 s timeout: 3/6 kills (seeds 1, 4, 5; 51.5, 31.8, 159.2 s), $0.48. Seeds 7–8 were not played (the
$1 budget ran out). Recommended after the radar cut: 10/16 on seeds 1–16. Every benchmark improves;
the rung result is not better at six seeds, so the recommended crew is unchanged.

## Crew talk

A brain file may list `callouts`: the phrases its station may say, keyed by option name, each
with `say` (what the others hear) and `when` (what saying it tells the crew, and "choose this when
…"). A talking brain's every decision asks one more choice question, `callout`, over those phrases
plus `silence` (instruction override: `controls.callout.instructions`). An unknown or unsure answer
keeps the seat silent and is recorded as a fallback; `reference` and `idle` seats never speak.

**Parameterised callouts.** A callout with `fill` is a template: `say` holds `{degrees}` and
`{side}`, and when the brain chooses it, code fills them from the speaker's own display
([`brain/callout.ts`](../../modules/ai/src/brain/callout.ts)). The brain still only picks which
callout or silence; the numbers are deterministic, and a seat can only say what its station shows:
a display that does not show the value says nothing.

| `fill`          | Speaker  | Read from                                                            | Example                                          |
| --------------- | -------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| `lockedOffNose` | weapons  | `targeting-status` lock + its radar contact's bearing vs our heading | "need you 6° left"                               |
| `gunSkew`       | engineer | `damage-report` `/chainGuns/*` `bearingSkew`                         | "gun skewed 8° left"                             |
| `farContact`    | signals  | nearest ship or unidentified contact on its radar beyond 5 km        | "contact UFO-12 at 7.4 km, 20° left of the nose" |

**Pub-sub, filtered per decision.** Every crew run has one in-memory channel
([`crew/channel.ts`](../../modules/ai/src/crew/channel.ts)), the same in the headless crew and the
live crew: a seat publishes, every other seat may hear the last 5 s. Callouts are not addressed;
the listener filters. A control's wording lists the callouts that decision listens for, `hears:
["weapons.need_turn"]` (`<station>.<callout option>`), and only those, heard in the last 5 s, are
appended to that question's instructions: `On the radio: Weapons said "need you 6° left" 1 s ago.`
Other questions see nothing. A brain with no `hears` anywhere gets everything as `heard` in the
shared state, so brain versions written before per-decision listening replay unchanged. Radio
discipline is in code: the same seat repeating the same phrase (values included) within 10 s is
suppressed, so "need you 4° left" then "need you 2° left" both go out.

The sidecar gets one `callout` event per phrase chosen (`station`, `callout` option, filled
`phrase`, `delivered`: false when suppressed), the `callout` question's `decision` events, and
`heard` in each `brain_request`, so `decisions` shows the callout choices per station, `reask`
rebuilds the request with what was heard, and the `train` report counts callouts said / suppressed
per crew.

### What each seat shows that another does not

Owner's rule: a callout, and a trigger listening for it, only carries information that complements
what the listener's own station displays. From the manifest widgets and the sandbox readers
([`modules/mcp/src/readers.ts`](../../modules/mcp/src/readers.ts)):

| Speaker → listener | Speaker shows, listener does not                                              | Callout kept                                                    |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| weapons → helms    | which contact is locked; where it sits against the gun line                   | "target locked"; "need you {degrees}° {side}" (`lockedOffNose`) |
| engineer → weapons | damage report: chain gun bearing skew, rate-of-fire damage; repair queue      | "gun skewed {degrees}° {side}" (`gunSkew`)                      |
| engineer → helms   | damage report fields of helms systems (smart pilot offset, thruster capacity) | none: helms' own status strip already flags them damaged        |
| helms → weapons    | helms stats: rotation/maneuvering mode, strafe, boost                         | none: weapons sees the target's own motion on its radar         |
| signals → helms    | contacts between the helms radar's 5 km and its own 50 km                     | "contact {name} at {range} km, {bearing}" (`farContact`)        |
| signals → weapons  | contacts between the tactical radar's 10 km and 50 km                         | none: T1 enemies spawn 2–8 km, inside tactical reach            |
| any → engineer     | nothing the engineer needs: it shows every system's heat, power and damage    | none                                                            |

Dropped as already on the listener's console: helms "on its tail", "closing", "need a lock";
weapons "on the gun line, firing"; engineer
"energy low" (helms stats show energy), "gun overheating" (weapons' status strip shows the chain
gun's heat), "reactor down" (no listener action); signals "new contact scanned" (the contact's
identity appears on every radar at once). Weapons "lost the lock" is complementary but left out: helms has no action for it in these rungs. Every seat's radar is cut to its station's reach
(helms 5 km, tactical 10 km, long range 50 km; see [MCP server](mcp-server.md#radar-filtering)), so
signals sees farther than helms and weapons; scan level still reaches every radar at once.

Callouts vs listening, T1-lite seeds 1–16, 180 s timeout. Talking crew `jev-talk-h13-w12-e7-s7`
(helms v13 says "on its tail" only on arriving behind the target, signals v7 says "new contact
scanned" when a scan finishes, weapons v12 fire wording in clean UTF-8). Callouts-only crew
`jev-callouts-h14-w13-e8-s7`: the silent crew's wording plus the same callouts, so seats speak but
no wording uses `heard`:

| Crew                                       | T1-lite kills | median TTK | Cost (16 seeds) |
| ------------------------------------------ | ------------- | ---------- | --------------- |
| silent `jev-h11-w8-e6-s3`                  | 12/16         | 46 s       | $0.70           |
| talking `jev-talk-h13-w12-e7-s7`           | 12/16         | 46 s       | $0.85           |
| callouts only `jev-callouts-h14-w13-e8-s7` | 14/16         | 53 s       | $0.70           |

At 16 seeds the listening wording adds nothing over silence, and the callouts-only crew's two extra
kills are within seed noise; the earlier 8/8 for talk did not hold. Helms now says "on its tail" on
8% of decisions (was ~80%), signals speaks 36 times in 16 runs. Listening wording without callouts
heard (`jev-listen-h15-w14-e9-s3`) and the talking crew on T0 are built but not yet run.

Far-contact callout under the radar reach cut, crew `jev-farcall-h17-w15-e10-s8` (recommended plus
signals v8 saying "contact {name} at {range} km, {bearing}" beyond the helms radar's 5 km, and helms
v17 hearing it on `rotation` only), against recommended in the same run, T1-lite seeds 1–8, 180 s
timeout, 2 workers:

| Crew                                     | T1-lite 1–8 kills | median TTK | Cost  |
| ---------------------------------------- | ----------------- | ---------- | ----- |
| recommended                              | 6/8               | 49 s       | $0.42 |
| far contact `jev-farcall-h17-w15-e10-s8` | 5/8               | 42 s       | $0.57 |

Signals chose `far_contact` on 608 of 909 decisions (e.g. "contact target at 5.1 km, 54° left of the
nose") and helms' rotation requests carried it; no gain at 8 seeds, so recommended stays.

Complementary callouts, crew `jev-complement-h16-w15-e10-s3` (helms v16, weapons v15, engineer v10,
signals v3: the silent crew's wording plus the audited callouts and per-decision `hears`), against
the silent crew in the same run, 180 s timeout, 2 workers:

| Crew                                       | T1-lite 1–16 kills | median TTK | T0 1–8 kills | median TTK | Cost (T1-lite + T0) |
| ------------------------------------------ | ------------------ | ---------- | ------------ | ---------- | ------------------- |
| silent `jev-h11-w8-e6-s3`                  | 11/16              | 36 s       | 8/8          | 78 s       | $0.77 + $0.34       |
| complement `jev-complement-h16-w15-e10-s3` | 14/16              | 45 s       | 8/8          | 100 s      | $0.62 + $0.45       |

On T1-lite weapons put "need you N° left/right" on the air 444 times and "target locked" 51 times,
the engineer "gun skewed N°" 21 times; helms pressed the rotation offset reset on 41% of its
decisions. Three more kills on T1-lite, at a slower kill on both rungs; at 16 seeds three kills is
near seed noise (the silent crew scored 12/16 on an earlier run).

Recommended crew: [`crews/recommended.json`](../../modules/ai/crews/recommended.json), a copy of
`jev-complement-h16-w15-e10-s3`: every callout carries what the listener cannot see. Since the radar
reach cut it fails L0 (7/8, median 132.6 s) and L1 (10/16); see the suite baselines under
[Curriculum](#curriculum).

### Tactical: one brain for helms and weapons

A crew may seat `tactical` in place of `helms` and `weapons` (`crews/tactical-reference.json`,
`crews/jev-tactical-t1-e10-s3.json`). The station is the MCP multiplexer, and its brain,
[`brains/tactical.v1.json`](../../modules/ai/brains/tactical.v1.json), is a clone of `helms.v19` and
`weapons.v17`: their control wording merged, one decision answering both seats' questions. It is a
fused oracle meant to be distilled back into per-seat brains, so the seams stay visible:

- `seats` in the brain names the member seats; each seat's `callouts` are asked as `callout:<seat>`.
- Every `decision`, `command` and `callout` event carries `seat`; `brain_request` carries `seats`, and
  the archive manifest keeps it beside the station's brain and policy.
- A seat's callout is said on the crew channel as that seat, so the brain hears "weapons: target
  locked" at its next decision through the cloned `hears` wording, exactly as the split helms would.

The reference policy plays the fused seat to the same result as the split seats (T0 seeds 1–2: same
kill times and shells fired).

## Training

```bash
cd modules/ai
npm run train -- --scenario T0 --seeds 8 --crew crews/reference.json --crew crews/jev-helms-weapons.json [--timeout 300] [--latency 0.2] [--workers 1] [--out <dir>]
npm run decisions -- --recording <out>/<crew>/T0_seed1.sgr --md --low 10
npm run reask -- --recording <out>/<crew>/T0_seed1.sgr --brain brains/helms.v2.json
npm run read -- --recording <out>/<crew>/T0_seed1.sgr --station helms --t 40
```

- `train` plays a training rung (`modules/server/src/test/training`; `T1-lite`, a dragonfly that
  holds its ground and fires back with its capsule 70% breached, is the middle rung between `T0` and
  `T1`, which the reference crew wins 5/16) with a crewed player ship,
  every crew on the same seeds, and writes `<out>/<scenario>-crews.md` (kills, time to kill,
  decisions, fallbacks, refused commands, input tokens and cost per crew; per control: choice counts
  and mean confidence) and `<out>/<scenario>-crews.json`.
- A crew file (`crews/*.json`) names a policy and optionally a brain file per station.
- Every run is recorded (`<out>/<crew>/<scenario>_seed<N>.sgr`). The `.events.jsonl` beside it holds,
  besides fire and blast events, one `brain_request` per decision (raw display, capabilities,
  questions, brain id, version and hash, model, tokens, latency), one `decision` per control (choice,
  confidence, probabilities, source: `model` / `rule` / `fallback`) and one `command` per press (with
  whether the console accepted it). The game analysis tools read them too:
  `npm --prefix modules/server run analyze -- events --recording <x.sgr> --kind decision`.
- `decisions` summarises a run per control (choice distribution, mean and tenth-percentile
  confidence, how often the choice flipped, fallbacks) and lists the least confident decisions with
  their time, to look up with `analyze at`.
- `reask` puts a recorded run's questions to another brain version without running the game, from
  exactly what each station showed, and reports per control how often it agrees and how its
  confidence moved. Whether the changed decisions win still takes a `train` run on the same seeds.
- `read` prints the verbal UI's reading of one station at a recorded time: the sentences a `verbal`
  brain saw at that decision.

```bash
npm run compare -- --results <out>/T0-crews.json [--results <other>/T0-crews.json] [--baseline <crew>] [--timeout 120]
npm run agree -- --recording <x.sgr | folder> --station helms [--brain brains/helms.v12.json] [--reach 5000] [--md]
```

- **Answer cache.** Every Jev answer is stored on disk under `training-archive/jev-cache`, keyed by
  model and request; a request already paid for is answered from disk for free, so a replayed seed
  makes the same decisions. Reports show paid and cached tokens apart. `--no-cache` asks afresh,
  `--cache-dir <dir>` uses another folder (`JEV_CACHE=off`, `JEV_CACHE_DIR` in the environment).
  Measured: one T0 seed, 30 s, helms v11 + weapons v5: first run 22 s wall, 200k paid tokens; the
  replay 4 s, 0 paid, identical frames and decisions.
- **Parallel seats.** Seats due on the same tick ask Jev at once; their decisions are recorded in seat
  order.
- **Run value.** Each run also gets the time-mean of the snapshot score over its frames
  (`scoring/run-score.ts`): `value` (the time after a kill counts as 1) and one score per station.
  Train and suite reports pair every crew with the first (or `--baseline`) seed by seed: mean
  difference, 95% t interval and sign test. `compare` does the same from finished results files;
  `--timeout` rescores from the recordings over a common horizon, for runs played with different
  timeouts or recorded before results carried a run value.
  On archived T0 seeds 1–8 (`agents/t0`), run value calls `jev-h11-w8-e6-s3` better than
  `jev-h11-w8-idle-es` on 8/8 seeds (sign p 0.008) where kills (7/8 vs 3/8) are within noise
  (p 0.22), and the reference better than the same crew 8/8 (kills p 0.063). Reference vs idle
  separates on both. At 4 seeds a sign test cannot go below p 0.125, so only the t interval can call
  a difference there. Station scores mislead across crews: helms score ranks a crew that sits in
  firing position without killing above the reference.
- **Teacher agreement.** `agree` scores a helms or weapons brain by how often it chooses what the
  reference policy chooses on the displays recorded in runs, per control and overall over the
  controls the reference plays (`actAgreement`: on decisions where the reference does not rest).
  Without `--brain` it scores the brain that played each run, from its recorded decisions, for free;
  with `--brain` it asks that brain (answers from the cache when held). `--reach` cuts the recorded
  radar for runs made before station radars were cut to their reach (helms 5000, weapons 10000).
  It detects a broken brain but does not rank good ones: on the archived benchmark runs weapons v9
  (the recorded failure) agrees 26% where the reference fires, v5–v8 93–100%; but v8, the best on
  weapons-range (133.5 vs v5 54.5, reference 65), agrees least overall (80% vs v5 94%), because it
  fires where the reference holds. Helms v6→v11 agreement rises with version (intercept 19%→38%,
  hold 15%→24%) while staying far below the reference's own runs; it is a cheap screen before a
  rung, not a replacement for one.

Helms brain versions so far, T0 seeds 1–4, 120 s:

| Version         | Wording                                          | Kills                                  |
| --------------- | ------------------------------------------------ | -------------------------------------- |
| v1              | generic                                          | 0                                      |
| v2              | exact conditions on data paths                   | 0/4                                    |
| v3              | option descriptions only                         | 0/4 (flies closer, almost never fires) |
| v4              | option descriptions + "choose this when" clauses | 3/4, median 87.7 s, $0.23 per 4 runs   |
| reference rules | —                                                | 8/8 on seeds 1–8                       |

`--latency` delays every press by simulated seconds, as a network would; held triggers end on
simulated time.

## Curriculum

Owner's approach: master a simple challenge, record what it taught, and add complexity only when a
level plateaus, reusing the lessons. The ladder,
[`curriculum/ladder.json`](../../modules/ai/curriculum/ladder.json) (schema:
[`suite/ladder.ts`](../../modules/ai/src/suite/ladder.ts)), orders levels along complexity axes:
`baseline`, `variance` (same difficulty, wider situations), `threat`, `internal` (the ship's own
energy, ammo and heat), `enemies`, `mission`, `space`. Each level names its rungs and station
benchmarks, seeds, timeout, plateau criterion (no gain in its metric beyond seed noise for N versions)
and acceptance thresholds (kill rate, median time to kill per rung).

| Level | Axis                                   | Plays                                                               | Seeds | Accept              |
| ----- | -------------------------------------- | ------------------------------------------------------------------- | ----- | ------------------- |
| L0    | baseline                               | `T0` and every station benchmark                                    | 1–8   | 7/8, median ≤ 120 s |
| L0b   | variance                               | `T0-wide`: 1–10 km, dragonfly MK1 or MK2                            | 1–16  | 75%                 |
| L1    | threat                                 | `T1-lite`                                                           | 1–16  | 75%                 |
| L2    | internal                               | `T0-constrained`: 10–30% energy, 250–450 shells, guns at heat 40–70 | 1–8   | 50%                 |
| L3–L6 | enemies, threat ladder, mission, space | placeholders, not built                                             |       |                     |

`T0-wide` and `T0-constrained` are calibration rungs (`createTrainingT0Map`'s `T0Lab`). On
`T0-constrained` the reference fires 196–367 shells per kill, so the shell floor binds.

Suite baselines with every station radar cut to its reach:

| Crew          | L0 `T0`      | L0b `T0-wide` | L1 `T1-lite`  | L2 `T0-constrained` |
| ------------- | ------------ | ------------- | ------------- | ------------------- |
| `reference`   | 8/8, 80.6 s  | 16/16, 80.6 s | 13/16, 46.9 s | 6/8, 93.4 s         |
| `recommended` | 7/8, 132.6 s | not played    | 10/16, 61.6 s | not played          |

Reports: `training-archive/2026-10-02/suite/reference-221925/`, `recommended-081501/` (L0) and
`recommended-083320/` (L1). The recommended crew fails both levels it played (L0 accept needs a
median ≤ 120 s, L1 needs 75%).

The reference reaches a target beyond the helms radar by pressing the rotation-mode key until
weapons' lock makes it hold, then flying forward; the recommended crew's helms (v16) does not, and
stands still on spawns beyond 5 km.

```bash
cd modules/ai
npm run suite -- --crew crews/<crew>.json [--levels L0,L1] [--baseline <name>] [--save-baseline] [--workers 4] [--out <dir>] [--archive]
```

`suite` plays every built level listed (default: all) for the crew: rungs through `train`, benchmarks
through `bench` with the crew's own brain and policy at that benchmark's station (benchmarks for
stations the crew does not seat are skipped). It writes `<out>/suite.md` and `suite.json` (per level
and item: result, refused, fallbacks, level accepted, verdict against the baseline) and exits 1 on any
regression. Baselines are committed, small, per crew or name:
[`curriculum/baselines/<name>.json`](../../modules/ai/curriculum/baselines); `--save-baseline`
replaces the levels just played. `--archive` copies the run into
`training-archive/<date>/suite/<crew>-<time>/` beside the repo and rebuilds that day's manifest.

Regression rule ([`suite/regression.ts`](../../modules/ai/src/suite/regression.ts), thresholds in
the ladder's `regression`), compared only on identical seeds and timeout:

- **Kills:** regressed when below `n·p − z·√(n·p·(1−p))`, `p = (k₀ + ½)/(n₀ + 1)` from the baseline,
  `z` 1.645 (one-sided 5%). From 8/8, 7/8 is noise and 6/8 regresses; from 12/16, 9/16 is noise and
  7/16 regresses.
- **Median time to kill:** regressed when slower than the baseline by more than 25%, with at least 3
  kills on both sides.
- **Benchmark score:** regressed when the mean drops by more than `max(0.05, z·SE)` of the two seed
  sets.

A candidate is accepted only if it passes its own level and nothing regresses on any earlier level
or benchmark. Lessons, with evidence and reuse notes, go to
[`curriculum/lessons.md`](../../modules/ai/curriculum/lessons.md).

## Live game

```bash
npm --prefix modules/ai run crew -- --url http://localhost:8080 --ship GVTS --crew crews/reference.json [--record] [--seconds N] [--out <dir>]
```

Run it from Git Bash: PowerShell's npm drops the `--` flags. In PowerShell call the script directly from `modules/ai`: `node --env-file-if-exists=.env -r ts-node/register/transpile-only ./src/cli/crew.ts --url ...`.

Waits for a running game, seats each crew station on the ship as an MCP `login` does
([`console/live.ts`](../../modules/ai/src/console/live.ts): the server's manifest decides the seat,
and it registers as `ai-<station>` on the GM roster), and plays until Ctrl-C or `--seconds` of game
time ([`live/live-crew.ts`](../../modules/ai/src/live/live-crew.ts)). Game time is wall time times
the admin speed; a paused game makes no decisions. A seat whose brain throws records a `brain_error`
event and keeps playing.

`--out` (default: the OS temp dir's `starwards-live-crew`) receives `<name>.events.jsonl` with the
same `brain_request` / `decision` / `command` events a training run records. With `--record` the
server records the game, `<name>` is the recording's, event times follow the recording's clock, and
`<name>.sgr` is downloaded beside the sidecar, so `decisions`, `reask` and `analyze` work on it.
Presses go out as soon as a seat decides: the network is the latency. Held triggers hold for wall
seconds.

## Snapshot scoring

`scoreSnapshot(saved, playerId?)` (`modules/ai/src/scoring/score.ts`) is a heuristic value function
over one `SavedGame` frame: fast, deterministic, no Python at runtime. It scores the frame from the
player ship against its opponent (the nearest ship of another faction) and returns `undefined`
without both. Every value is in [0, 1], in three layers:

| field                  | meaning (label it is trained on)                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `overall.kill`         | calibrated P(target killed within 60 s) (`kill60`)                                       |
| `overall.damage`       | expected drop of the player's integrity over 30 s, lower is better (`damage30`)          |
| `overall.value`        | `kill × (1 - damage)`, a composition, not trained                                        |
| `tactical.score`       | expected tactical score T over the next 45 s, shared by helms and weapons (`tactical45`) |
| `tactical.opportunity` | expected O, helms' share of T: time with a firing solution (`opportunity45`)             |
| `tactical.conversion`  | expected V = T / O, weapons' share of T (`conversion45`, censored where O = 0)           |
| `stations.helms`       | expected share of the next 10 s in firing position (`helms10`); not validated            |
| `stations.engineer`    | expected engineer score K over the next 30 s (`engineer_kpi30`)                          |

T, O, V and K_w are defined in `scoring/weapons-kpi.ts` and the weapons report; K in
[Engineer score](#engineer-score). Integrity is the mean of armor health ratio, `healthRatio` and capsule
integrity. Firing position is the target 500–3000 m away with the nose line passing within 100 m of it.
Exact label definitions, including censoring, are in `scoring/labels.ts`. The tactical and weapons
labels need the sidecar's `shot` and `damage` events, so runs recorded without them are censored for
those labels.

Signals has no station score. The scan queue runs on its own: a contact rises a tier per 5 s in the
ship's field of view from any radar, and the reference signals seat rests, so a scan label measures the
queue, not the seat. It stays parked until the seat has levers to credit: the beam matters only beyond
the omni radar's reach ([#2307](https://github.com/starwards/starwards/issues/2307)), brains cannot
reorder the queue ([#2308](https://github.com/starwards/starwards/issues/2308)), and no signals callout
carries a target or structured intel.

The models are exported artefacts, `scoring/models/<version>.json` (feature list, dataset hash, metrics,
parity fixture), trained by `modules/ai/ml` on the training archive; see
[`modules/ai/ml/README.md`](../../modules/ai/ml/README.md) for rebuilding the dataset, retraining and
the evaluation protocol (seed and leave-one-scenario-out holdouts, persistence baseline, calibration,
backwards benchmark, behavioural orderings). Artefacts are read by feature name, so v1 still scores.

Current models (`modules/ai/ml/reports/2026-10-03-v2.md`), trained on 2778 runs:

- Every head comes from v2. v2 replaces v1 unless a scenario regresses beyond noise: Δ loss (v2 − v1, 95% bootstrap CI over runs) counts as a regression only when the whole CI lies above a noise floor (0.002 logloss for `kill60`, 0.0005 mse for `damage30`; the calibration floor alone costs up to 0.001 logloss) on at least 5 runs. A CI above the floor on fewer runs is reported as insufficient evidence. Pooled v2 beats v1 (kill60 logloss 0.226 → 0.139, damage30 mse
  0.0124 → 0.0026); no scenario regresses beyond noise; T1-noweave damage30 (+0.0028, 2 runs) is
  insufficient evidence.
- Persistence gain (1 − loss / loss of the label's own past value): kill60 0.76, damage30 0.76, T 0.64,
  O 0.77, V 0.53, helms 0.65, engineer 0.72.
- The weapons station score K_w is not a snapshot field: it is a rate over rounds fired, computed
  exactly from the recorded `shot`/`damage` events (`weaponsScore`; `RunScore.weapons` from
  `scoreRun`). Weapons' snapshot share is `tactical.conversion`.
- On the matched-seed validation runs the model's out-of-fold station scores keep every pooled policy
  ordering the labels hold (engineer reference > idle, all-max, random; T and V reference > idle; V
  reference > wrong-ammo).

```bash
npm --prefix modules/ai run score -- --recording <x.sgr> [--every 5] [--ship GVTS]   # score series of a run
```

Features (`scoring/features.ts`), one frame only: velocities are in the frame, so closing and
crossing rates need no history.

| feature                      | station  | unit       | meaning                                                                       |
| ---------------------------- | -------- | ---------- | ----------------------------------------------------------------------------- |
| `h_distance_km`              | helms    | km         | distance to target                                                            |
| `h_off_nose`                 | helms    | 0..1       |                                                                               | target bearing off nose | / 180° |
| `h_off_nose_cos`             | helms    | -1..1      | cos of target bearing off nose                                                |
| `h_off_tail`                 | helms    | 0..1       | player's angle off the target's tail / 180°                                   |
| `h_lateral_miss_km`          | helms    | km         | how far the nose line passes beside the target (distance if > 90° off)        |
| `h_in_gun_band`              | helms    | 0/1        | distance within 500..3000 m                                                   |
| `h_in_firing_position`       | helms    | 0/1        | in gun band and nose line within 100 m of target                              |
| `h_closing_speed`            | helms    | km/s       | rate the distance shrinks (negative: opening)                                 |
| `h_lateral_speed`            | helms    | km/s       | relative speed across the line of sight                                       |
| `h_own_speed`                | helms    | km/s       | player speed                                                                  |
| `h_target_speed`             | helms    | km/s       | target speed                                                                  |
| `h_turn_rate`                | helms    | 100°/s     |                                                                               | player turn speed       |        |
| `h_afterburner_fuel`         | helms    | 0..1       | afterburner fuel / max                                                        |
| `h_maneuvering`              | helms    | 0..1       | maneuvering effectiveness × efficiency                                        |
| `w_locked`                   | weapons  | 0/1        | weapons target is the target                                                  |
| `w_gun_firing`               | weapons  | 0/1        | any chain gun firing                                                          |
| `w_gun_loading`              | weapons  | 0..1       | mean chain gun load progress                                                  |
| `w_gun_effectiveness`        | weapons  | 0..1       | mean chain gun effectiveness                                                  |
| `w_gun_heat`                 | weapons  | heat       | max chain gun heat                                                            |
| `w_shells`                   | weapons  | 0..1       | shell rounds / magazine capacity                                              |
| `w_missiles`                 | weapons  | 0..1       | missiles / magazine capacity                                                  |
| `w_target_armor`             | weapons  | 0..1       | target armor health ratio                                                     |
| `w_target_systems`           | weapons  | 0..1       | target healthRatio (systems intact)                                           |
| `w_target_capsule`           | weapons  | 0..1       | target capsule integrity                                                      |
| `e_reactor_energy`           | engineer | 0..1       | reactor energy / max                                                          |
| `e_energy_cells`             | engineer | 0..1       | energy cells / max                                                            |
| `e_mean_effectiveness`       | engineer | 0..1       | mean effectiveness over all systems                                           |
| `e_min_effectiveness`        | engineer | 0..1       | lowest system effectiveness                                                   |
| `e_broken`                   | engineer | 0..1       | share of systems broken                                                       |
| `e_starved`                  | engineer | 0..1       | share of systems energy-starved                                               |
| `e_max_heat`                 | engineer | heat       | hottest system heat                                                           |
| `e_mean_power`               | engineer | 0..1       | mean power setting over systems                                               |
| `e_own_armor`                | engineer | 0..1       | player armor health ratio                                                     |
| `e_own_systems`              | engineer | 0..1       | player healthRatio                                                            |
| `e_own_capsule`              | engineer | 0..1       | player capsule integrity                                                      |
| `e_repair_slots`             | engineer | count      | repair queue slots in use                                                     |
| `s_scan_level`               | signals  | 0..1       | scan level on target / FULL                                                   |
| `s_jobs`                     | signals  | count      | signals jobs retained                                                         |
| `s_target_job_progress`      | signals  | 0..1       | progress of the in-progress job on the target (0 if none)                     |
| `s_signals_effectiveness`    | signals  | 0..1       | signals system effectiveness                                                  |
| `s_radar_effectiveness`      | signals  | 0..1       | mean radar effectiveness                                                      |
| `o_target_gun_effectiveness` | overall  | 0..1       | target mean chain gun effectiveness                                           |
| `o_target_shells`            | overall  | 0..1       | target shell rounds / capacity                                                |
| `o_target_hostile`           | overall  | 0/1        | target follows an order or fights back when idle (not PLAY_DEAD)              |
| `t_solution`                 | tactical | 0..1       | threat-weighted share of enemies with a firing solution now (frame term of O) |
| `t_target_threat_share`      | tactical | 0..1       | opponent's share of the enemies' threat θ                                     |
| `t_threat`                   | tactical | log(1+dps) | summed enemy threat θ before normalising                                      |
| `t_enemies`                  | tactical | count ≤ 3  | living enemies                                                                |
| `t_target_incapacitation`    | tactical | 0..1       | opponent's incapacitation I                                                   |
| `t_own_incapacitation`       | tactical | 0..1       | player's incapacitation I                                                     |
| `w_ammo_shortfall`           | weapons  | 0..1       | loaded shell's value shortfall against the best shell in the magazine         |
| `w_tubes_ready`              | weapons  | 0/1        | a working tube and a missile in the magazine                                  |
| `e_demand`                   | engineer | 0..1       | demand Σa per system the frame shows (no sidecar)                             |
| `e_service`                  | engineer | 0..1       | service S over that demand                                                    |
| `e_risk`                     | engineer | 0..1       | engineer-score risk r without the blast rate                                  |
| `e_backlog`                  | engineer | 0..1       | mean defect severity over systems                                             |

### Engineer score

`stations.engineer` above is the trained snapshot model of this score. The engineer score proper is `modules/ai/src/scoring/engineer-kpi.ts`. It is computed from a recording's frames and
sidecar, never from the trained model, and its per-frame K over the next 30 s is the `engineer_kpi30`
dataset column. Per frame, over the player ship's systems:

- demand `a` comes from what the other seats request: smart-pilot commands, TARGET modes, afterburner,
  weapons' fire decisions or a held lock, tube commands; radar demand comes from unresolved contacts;
  the reactor is always demanded;
- supply `e = min(1, power / NORMAL) × hacked`, or 0 when broken or energy-starved;
- `K = D60 · ((1 − λ)·S + λ·R)`, where:
    - `S = Σa·e / Σa`;
    - `R = 1 − exp(−k·store / N0(1 + β·r))`, with store = energy share + 0.3 per cell;
    - `D60` is the mean demand-weighted intactness over the next 60 s;
    - `λ = min(0.6, λ0 + λ1·r)`.

Risk `r` is a logistic with non-negative coefficients over hostiles in range, nearness, recent blast hits,
lost integrity and unscanned contacts. It is fitted to own integrity loss in the next 30 s.

The reserve counts the reactor's energy only; energy cells are a fallback. It is set by design: λ0 0.3 and λ1 0.4. The store to hold rises from 0.25 calm to 0.5 at full
risk, and holding it earns R = 0.9 (N0 0.25, β 1, k ln 10). Only ε is fitted.

`npm --prefix modules/ai run score:engineer -- --runs <train out dir> ...` validates the score on
matched-seed runs of the scripted engineers (`crews/engineer-*.json`):

- it compares paired runs over their common time;
- it reports each KPI Δ next to the paired outcome Δs (kills, own integrity kept), and how often the
  KPI's sign agrees with the outcome's.

Status on 420 runs, in `modules/ai/ml/reports/2026-10-03-engineer-kpi.md`: wherever kills or time-to-kill
separate two engineers, the KPI's ordering agrees in sign (reference over idle, all-max and random on
T1 and T1-MK2). Design decisions (owner, 2026-10-03):

- repairs clear damage the KPI barely registers (D moves about 0.04); in 5-minute fights that small
  effect is accepted and repairs are not credited separately;
- the E1 rungs (energy-bound, almost no kills) gate on damage per exposure second only, since survival
  time rewards not fighting;
- idle > all-shutdown is required only where outcomes separate them (T0-constrained, pooled). Where
  nothing is fought, an all-shutdown engineer banking a full store and outscoring idle is accepted
  (no demand, K = D·R).

`engineer_kpi30` is the training target of `stations.engineer` since v2. The supply cap stays until
energy draw becomes a curve in power (#2305).

## Radar heatmaps

`heatmapAt(saved, playerId?)` (`modules/ai/src/heatmap/heatmap.ts`) maps the space around the player
ship into cells and estimates, per cell, where the opponent will be and what being there is worth.
Not wired into any brain; `describeHeatmap(map)` is the one-line reading a brain would get.

**Grid** (`heatmap/grid.ts`): 8 sectors of 45° around the nose (clockwise, "right" as the verbal UI
reads it) × 4 time-to-reach bands (< 5, 5–15, 15–40, > 40 s), not distance rings. Time-to-reach is a
lower bound from the ship's position, velocity, heading, turn rate and design (thrust per direction,
`rotationCapacity`, `maxTurnSpeed`, `maxSpeed`): the sooner of thrusting now with the current heading
and turning the nose first. The bands are recomputed every frame; training labels use the bands as
computed at the snapshot time.

| map        | value per cell                                                        | station that could use it        |
| ---------- | --------------------------------------------------------------------- | -------------------------------- |
| `threat5`  | P(opponent in the cell 5 s from now); sums to 1 over the grid         | helms, signals (radar contacts)  |
| `threat10` | the same, 10 s from now                                               | helms, weapons (lead), signals   |
| `fire`     | P(our blast hits the opponent within 10 s of entering the cell)       | helms (where to fly), weapons    |
| `danger`   | P(we are hit or lose integrity within 10 s of entering the cell)      | helms, engineer (brace, repairs) |
| `value`    | expected snapshot-scorer `overall.value` 10 s after entering the cell | captain / overall                |

Inputs are limited to what a station displays (`heatmap/inputs.ts`, each input names its screen):
range and bearing of the opponent, relative and own velocity in the ship's frame, the opponent's
speed and aspect, own turn rate, own integrity and shells, plus per-cell geometry (where straight-line
drift takes the opponent; range, aim offset and gun band from the cell centre). No scan-gated or
hidden state (opponent orders, its ammunition) is used.

```bash
npm --prefix modules/ai run heatmap -- --recording <x.sgr> --t <seconds> [--ship GVTS]   # ASCII polar maps + cell table
```

Training, metrics and which maps are trustworthy: [`modules/ai/ml/README.md`](../../modules/ai/ml/README.md#heatmaps)
and `modules/ai/ml/reports/<date>-heatmap.md`.

## The key

A Jev seat needs `TYPESAFE_API_KEY`. Put it in `modules/ai/.env` (git-ignored):

```
TYPESAFE_API_KEY=...
```

The module's scripts load that file; the key is never logged or recorded. Without it, crews with a
`jev` seat refuse to start; `reference` and `idle` crews need nothing.

## Limits

- **Tubes and signals job commands are out**, until the station sandbox can release a tube's safety
  and pass a job id.
- **Crew talk is fixed phrases only**: no free speech, no questions to a seat, no human on the channel.
- **Confidence is uncalibrated** until thresholds are tuned on recorded runs; `minConfidence`
  defaults to 0.
- The reference policy plays helms and weapons only.
