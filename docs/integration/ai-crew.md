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

A brain file may list `callouts`: the fixed phrases its station may say, keyed by option name, each
with `say` (what the others hear) and `when` (what saying it tells the crew, and "choose this when
…"). A talking brain's every decision asks one more choice question, `callout`, over those phrases
plus `silence` (instruction override: `controls.callout.instructions`). An unknown or unsure answer
keeps the seat silent and is recorded as a fallback; `reference` and `idle` seats never speak.

Every crew run has one in-memory channel
([`crew/channel.ts`](../../modules/ai/src/crew/channel.ts)), the same in the headless crew and the
live crew. Each seat's request carries `heard`: the other seats' callouts of the last 5 s, read out
as `Weapons said "target locked" 2 s ago`. Radio discipline is in code: the same seat repeating the
same phrase within 10 s is suppressed. A brain uses what it hears through its wording ("press the
maneuvering mode key when Weapons said “target locked” in `heard`").

The sidecar gets one `callout` event per phrase chosen (`station`, `phrase`, `delivered`: false when
suppressed), the `callout` question's `decision` events, and `heard` in each `brain_request`, so
`decisions` shows the callout choices per station, `reask` rebuilds the request with what was heard,
and the `train` report counts callouts said / suppressed per crew.

Silent vs talking crew, seeds 1–8, 180 s timeout (talking crew: helms v12, weapons v11, engineer
v7, signals v6 — the silent crew's brains plus callouts and wording that uses `heard`):

| Crew                             | T0 kills, median TTK | T1-lite kills, median TTK | Cost (both rungs) |
| -------------------------------- | -------------------- | ------------------------- | ----------------- |
| reference                        | 8/8                  | 7/8, 81 s                 | —                 |
| silent `jev-h11-w8-e6-s3`        | 8/8, 95 s            | 6/8, 41 s                 | $0.73             |
| talking `jev-talk-h12-w11-e7-s6` | 8/8, 97 s            | 8/8, 49 s                 | $0.71             |

Talk ties on T0 and wins two more seeds on T1-lite, at a slower median kill: suggestive, not
proven at 8 seeds, and confounded with the listening wording. Helms says "on its tail" on most
decisions (most suppressed), signals never speaks: those `when` clauses need tightening.

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
