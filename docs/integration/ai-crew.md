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

A brain plays one station, alone: no crew talk. At every decision it is shown everything that
station's console displays, and for every control the console has it picks one of the buttons that
control physically offers:

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

## Training

```bash
cd modules/ai
npm run train -- --scenario T0 --seeds 8 --crew crews/reference.json --crew crews/jev-helms-weapons.json [--timeout 300] [--latency 0.2] [--workers 1] [--out <dir>]
npm run decisions -- --recording <out>/<crew>/T0_seed1.sgr --md --low 10
npm run reask -- --recording <out>/<crew>/T0_seed1.sgr --brain brains/helms.v2.json
```

- `train` plays a training rung (`modules/server/src/test/training`) with a crewed player ship,
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
- **No crew communication**: each brain decides alone from its own console.
- **Confidence is uncalibrated** until thresholds are tuned on recorded runs; `minConfidence`
  defaults to 0.
- The reference policy plays helms and weapons only.
