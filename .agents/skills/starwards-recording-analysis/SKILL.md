---
name: starwards-recording-analysis
description: Investigate a headless training recording (.swr.jsonl) via the analyze CLI instead of reading frames by hand -- use when asked why a training/balance run behaved a certain way, to diagnose a failed check, or to compare two recordings
version: 2026-09-21
related_skills:
  - starwards-verification (evidence before assertions)
  - starwards-debugging (general debugging framework)
---

# Recording analysis

## When to use this

A headless training run (`npm --prefix modules/server run training -- ...`) produces a
`.swr.jsonl` recording and a `TrainingResult` row. Neither answers "what happened" -- the result
is end-of-run scalars, and the recording is thousands of gzipped snapshots nobody reads by hand.
Use this skill instead of decoding frames yourself whenever you're asked to explain a run's
outcome, chase a "why didn't X happen" question, or diff two runs.

Design: `docs/superpowers/specs/2026-09-21-recording-analysis-design.md`.

## The CLI

`npm --prefix modules/server run analyze -- <command> [options]`. Every command takes
`--store <file>` or `--recording <file>` (ingests + runs events/checks if the store is missing or
stale), and prints bounded JSON (`--md` for a markdown table).

| command | use for |
| --- | --- |
| `summary` | **Always start here.** Run metadata, objects with roles, every check's pass/fail/skip, event counts by kind. |
| `checks [--list]` | Check rows for this run, or the catalogue with its parameters. |
| `events [--kind k,…] [--object id] [--t0 --t1]` | Filtered event rows. |
| `series --object <id> --path <p> [--t0 --t1] [--agg]` | Downsampled series plus min/max/argmin/argmax over the full window. |
| `at --t <s> [--object id] [--path prefix]` | Resolved values at one instant. |
| `diff --t0 --t1` / `diff --other <store> --from <s>` | What changed between two instants, or the first divergence between two runs sharing a prefix. |
| `dictionary [--path prefix]` | Path meanings and units (below). |
| `sql "<SELECT ...>"` | Escape hatch, read-only. |

## Procedure

1. `summary` — note which checks failed and their `t`.
2. Pick one failed check. `events --t0 <t-5> --t1 <t+5>` around its `t` to see what else happened
   in that window (fire windows, proximity, velocity spikes, system breaks).
3. At most three `series` calls to confirm a hypothesis against the actual numbers (e.g. distance
   over the fire window, or speed around a `velocity_spike`).
4. State a verdict that cites `(object, path, t)` rows or event ids -- never "the state suggests".

Every claim is either a **read value** (a row you queried) or an **inference** (your reasoning
from those rows). Say which. A Sonnet-class model with this procedure and the dictionary below is
the intended investigator; if a failure mode doesn't fit an existing check, that's a signal to add
a new check in `analysis/checks.ts`, not to reach for a bigger model.

## Dictionary (roles' key paths)

Full list: `npm --prefix modules/server run analyze -- dictionary`. The paths that matter most for
a player/target investigation:

| path | meaning |
| --- | --- |
| `/destroyed` | object destroyed (boolean) |
| `/position/x`, `/position/y` | world position, m |
| `/velocity/x`, `/velocity/y` | world velocity, m/s |
| `/healthRatio` | ship health, 1 = intact, 0 = derelict threshold |
| `/armor/armorPlates/N/layers/M/health` | armor plate layer health, hp |
| `/chainGuns/N/isFiring` | gun N firing (boolean) |
| `/chainGuns/N/design/maxShellRange` | gun N effective range, m |
| `/magazine/count_HiExpShell` / `count_ArmPenShell` / `count_FragShell` | shells remaining |

## Event kinds

`spawn`/`despawn`, `destroyed`, `health_threshold` (crosses 0.75/0.5/0.25/0.05 downward),
`plate_broken`/`armor_stripped`, `fire_start`/`fire_stop`, `ammo_empty`,
`system_broken`/`system_repaired`, `velocity_spike` (speed delta over a per-object threshold),
`proximity` (player/target distance drops below a threshold). Every event's `detail_json` names
the paths/thresholds it was derived from.

## Checks

`target_holds_position`, `fire_within_range`, `shells_damage_armor`, `strip_leads_to_kill`,
`player_stays_mobile`, `frames_regular`. `shells_damage_armor` and `fire_within_range` together
separate hit-rate from damage-past-armor -- check both before concluding "the gun can't hit" vs.
"the gun hits but the shell doesn't damage".

## No harness code here

This skill is a procedure, not an implementation. If you need to change what a check or event
means, edit `modules/server/src/test/training/analysis/{checks,events}.ts`, not this file.
