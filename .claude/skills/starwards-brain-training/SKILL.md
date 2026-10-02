---
name: starwards-brain-training
description: Train and tune a station brain (modules/ai) in the headless game -- use when asked to improve how a bot plays a station, to compare brain versions, to explain why a brain decided something, or to run Jev crews on a training rung
version: 2026-10-02
related_skills:
    - starwards-recording-analysis (the game side of a recorded run)
    - starwards-balance-check (when the question is the game's balance, not the brain)
---

# Brain training

## When to use this

A brain is one data file (`modules/ai/brains/<station>.v<N>.json`): role, mission, per-control
wording, confidence floor, hidden display parts. Improving a bot means writing its next version and
proving it plays better on the same seeds — never editing the brain code to fit one run.

Guide: `docs/integration/ai-crew.md`.

## Instruments

| Question                                       | Command (from `modules/ai`)                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| How did crews do on a rung?                    | `npm run train -- --scenario T0 --seeds 8 --crew crews/a.json --crew crews/b.json --out <dir>`                      |
| How was each control played?                   | `npm run decisions -- --recording <dir>/<crew>/T0_seed1.sgr --md --low 10`                                          |
| What did the game look like at a bad decision? | from repo root: `npm --prefix modules/server run analyze -- at --recording <x.sgr> --t <t> --roles p=GVTS,t=target` |
| What did a `verbal` brain read at a decision?  | `npm run read -- --recording <x.sgr> --station <station> --t <t>`                                                   |
| Would new wording decide differently?          | `npm run reask -- --recording <x.sgr> --brain brains/<station>.v<N+1>.json`                                         |
| Does a candidate hold on every level?          | `npm run suite -- --crew crews/<candidate>.json --baseline <accepted crew> --workers 4 --archive`                   |
| What did the crew say to each other?           | from repo root: `npm --prefix modules/server run analyze -- events --recording <x.sgr> --kind callout`              |

## Procedure

1. **Preflight.** `npm run build:core` if core changed. Jev seats need `TYPESAFE_API_KEY` in
   `modules/ai/.env`. Always include `crews/reference.json` (must kill) and `crews/idle.json` (must
   not): if either control fails, the harness is broken, not the brain.
2. **Baseline.** Train the current brain version on seeds 1–8; keep the report.
3. **Diagnose one control at a time.** `decisions --md --low 10`: look for controls with low
   confidence, high flip rates (dithering on an axis), fallbacks, or one option never chosen. Open
   the lowest-confidence times with `analyze at` / `series` and say what the display showed; for a `verbal` brain, `read` at that time prints the
   reading the brain actually saw.
4. **Name the cause before editing** (from the Jev rules): missing evidence in the display (hide less
   or note a sandbox gap), wording the model read literally (rewrite the instruction or option
   descriptions for that control), or a code error (wrong option mapping — fix code with a spec).
5. **Write v(N+1)** — a new file, never an edit of a recorded version. Change one thing.
6. **Reask** the baseline recordings with v(N+1): confirm the intended controls flipped and nothing
   else moved much. Cheap; do it before spending a training run.
7. **Train v(N+1) on the same seeds.** Keep it only if kills or time to kill improve without more
   refused commands. Record the result.
8. Cost: the report prints input tokens and dollars. Stop a tuning session at an agreed budget.

## Curriculum

The ladder (`modules/ai/curriculum/ladder.json`) orders levels by complexity axis; the lessons log
(`curriculum/lessons.md`) is read before a level and written after every candidate.

1. **Candidate** on the current level: write v(N+1) from the lessons' reuse notes, tune with the
   procedure above until the level's `accept` is met.
2. **Full regression suite:** `npm run suite -- --crew <candidate> --baseline <accepted crew>` over
   every built level up to and including the current one. Any `regressed` verdict rejects it.
3. **Accept or reject.** Accepted: `--save-baseline` under the accepted crew's name and make it the
   recommended crew. Rejected: keep the brain file as a recorded failure.
4. **Lessons entry** (template at the end of `lessons.md`), with the archive path.
5. **Plateau:** when the level's `plateau.metric` has not improved beyond seed noise for
   `plateau.versions` versions, add the next level (one axis, or wider variance at equal difficulty)
   and rerun the suite for the reference and idle crews to baseline it.

## Rungs

`T0` (target plays dead) for the basics; `T1-lite` (stand-ground target that fires back, capsule
70% breached; calibration only) to see whether a change holds up under fire. `T1` is unwinnable for
every crew including `reference`: a loss there says nothing about a brain.

## Crew talk

Callouts are brain data (`callouts` in the brain file); listening is wording that names a phrase in
`heard`. Tune a callout like a control: `decisions` shows its choice counts; a phrase said every
decision is suppressed by the channel and shows as `suppressed` in the report — tighten its `when`.

## Rules

- Evidence is the recording: cite `(t, control, choice, confidence)` and `(object, path, t)` rows.
- A brain must not read game state the station does not display; a gap goes to the backlog as a
  sandbox request, not into a brain.
- No code in this skill — the harness lives in `modules/ai/src`.
