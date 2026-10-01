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

| Question | Command (from `modules/ai`) |
| --- | --- |
| How did crews do on a rung? | `npm run train -- --scenario T0 --seeds 8 --crew crews/a.json --crew crews/b.json --out <dir>` |
| How was each control played? | `npm run decisions -- --recording <dir>/<crew>/T0_seed1.sgr --md --low 10` |
| What did the game look like at a bad decision? | from repo root: `npm --prefix modules/server run analyze -- at --recording <x.sgr> --t <t> --roles p=GVTS,t=target` |
| Would new wording decide differently? | `npm run reask -- --recording <x.sgr> --brain brains/<station>.v<N+1>.json` |

## Procedure

1. **Preflight.** `npm run build:core` if core changed. Jev seats need `TYPESAFE_API_KEY` in
   `modules/ai/.env`. Always include `crews/reference.json` (must kill) and `crews/idle.json` (must
   not): if either control fails, the harness is broken, not the brain.
2. **Baseline.** Train the current brain version on seeds 1–8; keep the report.
3. **Diagnose one control at a time.** `decisions --md --low 10`: look for controls with low
   confidence, high flip rates (dithering on an axis), fallbacks, or one option never chosen. Open
   the lowest-confidence times with `analyze at` / `series` and say what the display showed.
4. **Name the cause before editing** (from the Jev rules): missing evidence in the display (hide less
   or note a sandbox gap), wording the model read literally (rewrite the instruction or option
   descriptions for that control), or a code error (wrong option mapping — fix code with a spec).
5. **Write v(N+1)** — a new file, never an edit of a recorded version. Change one thing.
6. **Reask** the baseline recordings with v(N+1): confirm the intended controls flipped and nothing
   else moved much. Cheap; do it before spending a training run.
7. **Train v(N+1) on the same seeds.** Keep it only if kills or time to kill improve without more
   refused commands. Record the result.
8. Cost: the report prints input tokens and dollars. Stop a tuning session at an agreed budget.

## Rules

- Evidence is the recording: cite `(t, control, choice, confidence)` and `(object, path, t)` rows.
- A brain must not read game state the station does not display; a gap goes to the backlog as a
  sandbox request, not into a brain.
- No code in this skill — the harness lives in `modules/ai/src`.
