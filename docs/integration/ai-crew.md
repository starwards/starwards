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

| `fill`          | Speaker  | Read from                                                            | Example              |
| --------------- | -------- | -------------------------------------------------------------------- | -------------------- |
| `lockedOffNose` | weapons  | `targeting-status` lock + its radar contact's bearing vs our heading | "need you 6° left"   |
| `gunSkew`       | engineer | `damage-report` `/chainGuns/*` `bearingSkew`                         | "gun skewed 8° left" |

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

| Speaker → listener       | Speaker shows, listener does not                                              | Callout kept                                                         |
| ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| weapons → helms          | which contact is locked; where it sits against the gun line                   | "target locked"; "need you {degrees}° {side}" (`lockedOffNose`)      |
| engineer → weapons       | damage report: chain gun bearing skew, rate-of-fire damage; repair queue      | "gun skewed {degrees}° {side}" (`gunSkew`)                           |
| engineer → helms         | damage report fields of helms systems (smart pilot offset, thruster capacity) | none: helms' own status strip already flags them damaged             |
| helms → weapons          | helms stats: rotation/maneuvering mode, strafe, boost                         | none: weapons sees the target's own motion on its radar              |
| signals → helms, weapons | scan beam and job progress, selected-contact detail                           | none: all radars read the faction's one picture, scan level included |
| any → engineer           | nothing the engineer needs: it shows every system's heat, power and damage    | none                                                                 |

Dropped as already on the listener's console: helms "on its tail", "closing", "need a lock";
weapons "on the gun line, firing"; engineer
"energy low" (helms stats show energy), "gun overheating" (weapons' status strip shows the chain
gun's heat), "reactor down" (no listener action); signals "new contact scanned" (the contact's
identity appears on every radar at once). Weapons "lost the lock" is complementary but left out: helms has no action for it in these rungs. Signals' "far contact at bearing X" needs radars with
different reach: in the sandbox every seat's radar lists the same faction-visible contacts with no
range cut ([`sandbox/console.ts`](../../modules/mcp/src/sandbox/console.ts) `radarContacts`), so
signals has nothing complementary to say until helms and tactical radars are cut to their range.

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
`jev-complement-h16-w15-e10-s3`: most T1-lite kills, and every callout carries what the listener
cannot see.

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
  `T1`, which no crew wins, the reference included) with a crewed player ship,
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
without both. Every value is in [0, 1]:

| field               | meaning (label it is trained on)                                                        |
| ------------------- | --------------------------------------------------------------------------------------- |
| `overall.kill`      | calibrated P(target killed within 60 s) (`kill60`)                                      |
| `overall.damage`    | expected drop of the player's integrity over 30 s, lower is better (`damage30`)         |
| `overall.value`     | `kill × (1 - damage)`, a composition, not trained                                       |
| `stations.helms`    | expected share of the next 10 s in firing position (`helms10`)                          |
| `stations.weapons`  | expected drop of the target's integrity over the next 10 s (`weapons10`)                |
| `stations.engineer` | expected mean of system effectiveness × not starved over the next 30 s (`engineer30`)   |
| `stations.signals`  | expected share of the remaining scan gap on the target closed within 30 s (`signals30`) |

Integrity is the mean of armor health ratio, `healthRatio` and capsule integrity. Firing position is
the target 500–3000 m away with the nose line passing within 100 m of it. Exact label definitions,
including censoring at the end of a run, are in `scoring/labels.ts`.

The models are an exported artefact, `scoring/models/<version>.json` (feature hash, dataset hash,
metrics, parity fixture), trained by `modules/ai/ml` on the training archive; see
[`modules/ai/ml/README.md`](../../modules/ai/ml/README.md) for rebuilding the dataset, retraining and
the evaluation protocol, and `modules/ai/ml/reports/` for each version's metrics.

```bash
npm --prefix modules/ai run score -- --recording <x.sgr> [--every 5] [--ship GVTS]   # score series of a run
```

Features (`scoring/features.ts`), one frame only: velocities are in the frame, so closing and
crossing rates need no history.

| feature                      | station  | unit   | meaning                                                                |
| ---------------------------- | -------- | ------ | ---------------------------------------------------------------------- |
| `h_distance_km`              | helms    | km     | distance to target                                                     |
| `h_off_nose`                 | helms    | 0..1   |                                                                        | target bearing off nose | / 180° |
| `h_off_nose_cos`             | helms    | -1..1  | cos of target bearing off nose                                         |
| `h_off_tail`                 | helms    | 0..1   | player's angle off the target's tail / 180°                            |
| `h_lateral_miss_km`          | helms    | km     | how far the nose line passes beside the target (distance if > 90° off) |
| `h_in_gun_band`              | helms    | 0/1    | distance within 500..3000 m                                            |
| `h_in_firing_position`       | helms    | 0/1    | in gun band and nose line within 100 m of target                       |
| `h_closing_speed`            | helms    | km/s   | rate the distance shrinks (negative: opening)                          |
| `h_lateral_speed`            | helms    | km/s   | relative speed across the line of sight                                |
| `h_own_speed`                | helms    | km/s   | player speed                                                           |
| `h_target_speed`             | helms    | km/s   | target speed                                                           |
| `h_turn_rate`                | helms    | 100°/s |                                                                        | player turn speed       |        |
| `h_afterburner_fuel`         | helms    | 0..1   | afterburner fuel / max                                                 |
| `h_maneuvering`              | helms    | 0..1   | maneuvering effectiveness × efficiency                                 |
| `w_locked`                   | weapons  | 0/1    | weapons target is the target                                           |
| `w_gun_firing`               | weapons  | 0/1    | any chain gun firing                                                   |
| `w_gun_loading`              | weapons  | 0..1   | mean chain gun load progress                                           |
| `w_gun_effectiveness`        | weapons  | 0..1   | mean chain gun effectiveness                                           |
| `w_gun_heat`                 | weapons  | heat   | max chain gun heat                                                     |
| `w_shells`                   | weapons  | 0..1   | shell rounds / magazine capacity                                       |
| `w_missiles`                 | weapons  | 0..1   | missiles / magazine capacity                                           |
| `w_target_armor`             | weapons  | 0..1   | target armor health ratio                                              |
| `w_target_systems`           | weapons  | 0..1   | target healthRatio (systems intact)                                    |
| `w_target_capsule`           | weapons  | 0..1   | target capsule integrity                                               |
| `e_reactor_energy`           | engineer | 0..1   | reactor energy / max                                                   |
| `e_energy_cells`             | engineer | 0..1   | energy cells / max                                                     |
| `e_mean_effectiveness`       | engineer | 0..1   | mean effectiveness over all systems                                    |
| `e_min_effectiveness`        | engineer | 0..1   | lowest system effectiveness                                            |
| `e_broken`                   | engineer | 0..1   | share of systems broken                                                |
| `e_starved`                  | engineer | 0..1   | share of systems energy-starved                                        |
| `e_max_heat`                 | engineer | heat   | hottest system heat                                                    |
| `e_mean_power`               | engineer | 0..1   | mean power setting over systems                                        |
| `e_own_armor`                | engineer | 0..1   | player armor health ratio                                              |
| `e_own_systems`              | engineer | 0..1   | player healthRatio                                                     |
| `e_own_capsule`              | engineer | 0..1   | player capsule integrity                                               |
| `e_repair_slots`             | engineer | count  | repair queue slots in use                                              |
| `s_scan_level`               | signals  | 0..1   | scan level on target / FULL                                            |
| `s_jobs`                     | signals  | count  | signals jobs retained                                                  |
| `s_target_job_progress`      | signals  | 0..1   | progress of the in-progress job on the target (0 if none)              |
| `s_signals_effectiveness`    | signals  | 0..1   | signals system effectiveness                                           |
| `s_radar_effectiveness`      | signals  | 0..1   | mean radar effectiveness                                               |
| `o_target_gun_effectiveness` | overall  | 0..1   | target mean chain gun effectiveness                                    |
| `o_target_shells`            | overall  | 0..1   | target shell rounds / capacity                                         |
| `o_target_hostile`           | overall  | 0/1    | target follows an order or fights back when idle (not PLAY_DEAD)       |

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
