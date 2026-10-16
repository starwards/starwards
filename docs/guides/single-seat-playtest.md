# Play one seat with bot crewmates

You play one bridge station; bots play every other station of the same ship, live, in the same game.
Developer reference for the bots: [`docs/integration/ai-crew.md`](../integration/ai-crew.md).

## Prerequisites

- The repo checked out, dependencies installed (`npm install` at the repo root), Node as in
  [`DEPENDENCIES.md`](../DEPENDENCIES.md).
- Two terminals. Git Bash is easiest: every command below is copy-paste for Git Bash. PowerShell
  differences are noted where they matter.
- No API key. The default bots are rule-based. Only Jev crews (see [Crew files](#crew-files)) need
  `TYPESAFE_API_KEY`.

## Step by step

### 1. Start the game server (terminal 1)

From the repo root:

```bash
npm run dev
```

Wait until it prints `Project is running at: http://localhost:3000/`. Leave it running. The game
server is `http://localhost:8080`, the screens are on `http://localhost:3000`.

### 2. Start a round (terminal 2)

The single-seat scenario is `training_t1`: your ship `GVTS` against one attacking dragonfly 5 km
ahead (the `T1` rung, see [Glossary](#glossary)).

Git Bash:

```bash
curl -X POST -H 'Content-Type: application/json' -d '{"mapName":"training_t1"}' http://localhost:8080/start-game
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8080/start-game -ContentType 'application/json' -Body '{"mapName":"training_t1"}'
```

No output means it worked. The lobby's buttons (`2v1 Game`, `Solo Game`, `Wave Defence`) start other
maps; the bots play those too, but there is no baseline to compare them with.

### 3. Open your seat in the browser

| Your seat    | Station name (`--human-seat`) | Open                                          | Input    |
| ------------ | ----------------------------- | --------------------------------------------- | -------- |
| Pilot        | `helms`                       | http://localhost:3000/helms.html?ship=GVTS    | keyboard |
| Weapons      | `weapons`                     | http://localhost:3000/weapons.html?ship=GVTS  | keyboard |
| Engineer     | `engineer`                    | http://localhost:3000/engineer.html?ship=GVTS | keyboard |
| Signals      | `signals`                     | http://localhost:3000/signals.html?ship=GVTS  | keyboard |
| Dradis       | `dradis`                      | http://localhost:3000/dradis.html?ship=GVTS   | mouse    |
| GM (observe) | not a crew seat               | http://localhost:3000/gm.html                 | mouse    |

No bot plays Dradis, so with `--human-seat dradis` the bots still take all four other stations.
The Target Details screen (SPEC-0008) is not on `master` yet, so it is not a seat here.

### 4. Launch the bots (terminal 2)

Git Bash, from the repo root (example: you are the Pilot):

```bash
npm --prefix modules/ai run crew -- --human-seat helms
```

PowerShell drops the flags after `npm ... --`, so call the script directly from `modules/ai`:

```powershell
cd modules/ai
node --env-file-if-exists=.env -r ts-node/register/transpile-only ./src/cli/crew.ts --human-seat helms
```

Replace `helms` with your seat from the table. All flags: [Flags](#crew-command-flags).

### 5. What you should see when it works

```text
.env not found. Continuing without it.
waiting for a game on http://localhost:8080/ (start one from the lobby or with /start-game)
reference-signals seated on GVTS (weapons, engineer, signals); helms left to the human; Ctrl-C to stop
```

- The `seated` line lists the bot stations; your station is named as left to the human and must not
  be in the list. (`.env not found` is harmless.)
- On the GM screen the roster shows `ai-weapons`, `ai-engineer`, `ai-signals` taken; your seat is free.
- In game, within seconds: weapons locks the target and fires, the engineer changes power, signals scans.
- In a test run with the Pilot seat played by a stand-in, the attacker died about 22 s into the round.

### 6. Stop the bots

Press **Ctrl-C** in terminal 2. The crew finishes the presses in flight and prints its counts, e.g.

```text
{"decisions":363,"commands":21,"refused":0,"fallbacks":0,"brainErrors":0,"inputTokens":0,"callouts":0,"suppressed":0}
decisions: C:\Users\<you>\AppData\Local\Temp\starwards-live-crew\reference-signals-<time>.events.jsonl
```

To stop on its own instead, add `--seconds 180` (game seconds; `T1` is scored over 180 s).

### 7. Restart a round

1. Ctrl-C the bots.
2. Stop the game:
   `curl -X POST http://localhost:8080/stop-game` (PowerShell:
   `Invoke-RestMethod -Method Post -Uri http://localhost:8080/stop-game`).
3. Start it again (step 2) and reload your browser tab.
4. Launch the bots again (step 4).

You may launch the bots before starting the round: they print `waiting for a game` and take their
seats when it starts.

## Comparing your session with the all-bot baseline

The question: does the ship do as well with you in the seat as with a bot there?

- **Baseline (authoritative):** the committed headless run of the all-bot `reference` crew on `T1`,
  [`modules/ai/curriculum/baselines/reference.json`](../../modules/ai/curriculum/baselines/reference.json):
  **kills 16 of 16 rounds, median 38.7 s to kill**. It is what the curriculum table in
  [`ai-crew.md`](../integration/ai-crew.md#curriculum) shows and what regressions are judged against.
  A re-run on 2026-10-16 gave 16/16, median 42.1 s; the suite judged that the same as the baseline
  (seed noise). The 43.5 s that `ai-crew.md` used to show came from an older report and was replaced.
- **Your session:** launch the bots with `--record --seconds 180`. At the end they print
  `recording: <path>.sgr`. Ask the recording when the attacker and your ship died:

    ```bash
    npm --prefix modules/server run analyze -- sql "SELECT object_id, t FROM event WHERE kind='despawn' AND object_id IN ('target','GVTS')" --recording <path>.sgr
    ```

    `target` with a `t` = the attacker died at `t` seconds. `GVTS` = your ship died. Empty `[]` = no kill
    in 180 s.

- **Reading it, in plain words:** the baseline wins every time and usually within 40 s. A kill under
  about a minute is on par with the bots. A kill later than that is slower than the bots. No kill, or
  your ship dying, is worse than the bots. One live round is one sample: the live map always starts
  the attacker in the same place (5 km straight ahead), while the baseline spreads 16 rounds over
  different distances and bearings, so judge several rounds, not one.
- **Re-running the baseline yourself** (under 2 minutes, no server needed):

    ```bash
    npm --prefix modules/ai run suite -- --crew crews/reference.json --levels L3 --baseline reference
    ```

    It prints a table row with `kills 16/16, median … s` and `ok` in the `vs baseline` column when nothing changed.

## `crew` command flags

`npm --prefix modules/ai run crew -- --help` prints this list.

| Flag                     | Default                                      | Meaning                                                                     |
| ------------------------ | -------------------------------------------- | --------------------------------------------------------------------------- |
| `--human-seat <station>` | none (bots take every seat)                  | Station left to you: `helms`, `weapons`, `engineer`, `signals` or `dradis`. |
| `--crew <file>`          | `crews/reference-signals.json`               | Crew file, relative to `modules/ai`.                                        |
| `--url <url>`            | `http://localhost:8080`                      | Game server.                                                                |
| `--ship <id>`            | `GVTS`                                       | Ship the bots crew.                                                         |
| `--seconds <n>`          | until Ctrl-C                                 | Stop after `n` seconds of game time.                                        |
| `--record`               | off                                          | Record the game; the `.sgr` recording is saved next to the decisions file.  |
| `--out <dir>`            | `<OS temp>/starwards-live-crew`              | Where the decisions file (and recording) go.                                |
| `--no-cache`             | cache on                                     | Jev crews only: ask Jev every time instead of reusing saved answers.        |
| `--cache-dir <dir>`      | `training-archive/jev-cache` beside the repo | Jev crews only: where saved Jev answers live.                               |
| `--help`                 |                                              | Print the flags.                                                            |

## Crew files

In [`modules/ai/crews/`](../../modules/ai/crews). For playtests use `reference-signals` (the default)
or `reference`. The rest are experiments and score-validation crews, kept for the training reports.

| Crew file                                           | What it is                                                                                                                                                                                     | Seats                                                                         | Needs `TYPESAFE_API_KEY`                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| `reference-signals.json` (default)                  | Best rule-based crew, with signals                                                                                                                                                             | helms, weapons, engineer, signals                                             | no                                             |
| `reference.json`                                    | Best rule-based crew, the baseline crew                                                                                                                                                        | helms, weapons, engineer                                                      | no                                             |
| `tactical-reference.json`                           | Rule-based, helms and weapons fused into one `tactical` seat                                                                                                                                   | tactical (helms+weapons), engineer                                            | no                                             |
| `recommended.json`                                  | Best Jev brains so far (helms v16, weapons v15, engineer v10, signals v3); loses to `reference`                                                                                                | helms, weapons, engineer, signals                                             | yes                                            |
| `idle.json`                                         | Does nothing; the "no crew" floor                                                                                                                                                              | helms, weapons                                                                | no                                             |
| `helms-*.json`, `weapons-*.json`, `engineer-*.json` | Reference crew with one seat replaced by a deliberately good/bad scripted style (e.g. `helms-charge`, `weapons-spray-fire`, `engineer-all-max`); used to check that scores rank play correctly | helms, weapons, engineer                                                      | no                                             |
| `jev-*.json`                                        | Earlier Jev experiments; the name lists the brain versions (`h11` = helms v11, `w8` = weapons v8, `e6` engineer, `s3` signals; `idle-es` = engineer and signals idle)                          | helms, weapons, and usually engineer, signals; `jev-tactical-*` uses tactical | yes (except where every Jev seat is your seat) |

`--human-seat` removes your station from whichever crew you pick. With a crew that has a `tactical`
seat you cannot take helms or weapons (the bot would play them); the command refuses.

## Common failures

| Message / symptom                                                                               | Cause                                                   | Fix                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| Stuck at `waiting for a game on http://localhost:8080/`                                         | No round running, or the server is not up               | Do steps 1–2; the bots join as soon as the round starts.               |
| `Error: unknown human seat "helm": pick one of helms, weapons, engineer, signals, dradis`       | Misspelled station                                      | Use a name from the seat table.                                        |
| `Error: TYPESAFE_API_KEY is not set: a Jev brain cannot run without it.`                        | You picked a Jev crew                                   | Drop `--crew` (rule-based default), or set the key in the environment. |
| `Error: crew tactical-reference: seat tactical plays weapons, the human seat`                   | A fused seat would play your station                    | Use `reference-signals` (default) or `reference`.                      |
| `Error: station "…" is not open on GVTS`                                                        | That ship has no such station in this map               | Use `training_t1` and `--ship GVTS`.                                   |
| PowerShell prints npm's own help (`Run arbitrary package scripts`) instead of the crew starting | PowerShell's npm drops the flags after `--`             | Use Git Bash, or the `node ... ./src/cli/crew.ts` form in step 4.      |
| `.env not found. Continuing without it.`                                                        | Harmless                                                | Nothing.                                                               |
| The bots play on after you restarted the round without stopping them                            | Untested whether they then play the new round correctly | Restart as in step 7: Ctrl-C first, relaunch after.                    |

## Glossary

- **Station / seat.** A station is one bridge job and its screen: `helms` (the Pilot), `weapons`,
  `engineer`, `signals`, `dradis`. A seat is one place in a crew that plays a station. Usually one
  seat = one station; a fused seat plays two.
- **Fused seat, `tactical`.** One bot that plays helms and weapons together, as one brain pressing both
  stations' keys. It exists to test whether one mind flying and shooting beats two. Not usable when
  you take helms or weapons.
- **Crew file.** A small JSON file in `modules/ai/crews/` listing the seats and, for each, which brain
  and which policy plays it.
- **Brain.** The bot for one station: what it reads off that station's screen, what it may press, how
  often it decides (`brains/<station>.v<N>.json`, versions numbered).
- **Policy.** Who makes the bot's choices:
    - `reference` — the rule-based bot: hand-written rules, free, instant, the best player so far.
    - `jev` — the LLM bot: asks TypeSafe's Jev model each decision; needs `TYPESAFE_API_KEY`, costs money.
    - `idle` — presses nothing.
    - Scripted styles for score checks: helms `charge`, `close-in`, `far-off`, `no-weave`,
      `helms-random`; weapons `spray-fire`, `wrong-ammo`, `no-lock`, `lock-nearest`; engineer
      `all-max`, `all-shutdown`, `never-jump-start`, `random`, `reference-repairing`, `tubes-powered`.
- **Rule-based brain.** A bot running the `reference` policy.
- **Jev.** TypeSafe's language model, used as an optional bot policy. Answer cache: saved Jev answers
  reused for identical questions, so repeat runs cost nothing.
- **Rung (T0, T1, T2 …).** A training scenario of rising difficulty. `T0`: a target that plays dead
  2–8 km away. `T1-lite`: the target holds its ground and fires back, but starts badly damaged. `T1`: one dragonfly attacks from
  2–8 km. `T2`: two attackers. `-wide` / `-constrained` variants widen the situations or start the
  ship short of energy, shells and with hot guns. The live map `training_t1` is `T1` with the
  attacker always 5 km straight ahead.
- **Level (L0–L5) / curriculum / ladder.** The ordered list of rungs the bots must master; L3 is `T1`.
- **Seed.** The number that picks one round's random starting situation; a baseline plays the same
  seeds every time so results compare fairly.
- **Headless.** The game run as a simulation with no server and no screens, much faster than live.
- **Baseline.** The committed score of a crew that new results are compared with.
- **Kills `k/n`, median time to kill.** Rounds where the attacker died, out of rounds played; the
  middle kill time.
- **Run value.** A 0–1 score averaged over the whole round (1 after a kill), so two crews that both
  kill can still be told apart. The suite reports the difference to the baseline with a 95% interval
  and a sign test (`sign p`; above 0.05 means "no real difference").
- **Accepted / regressed.** A level is accepted when its kill rate (and time limit) is met; a result
  regressed when it is worse than the baseline by more than seed noise.
- **Decisions.** Choices the bots made (one per control per decision, including "do nothing").
- **Commands.** Key presses the bots sent to the server.
- **Refused.** Presses the server rejected. Should be 0.
- **Fallbacks.** Choices the brain could not get from its policy and filled with a safe default
  (a Jev answer that was missing or unsure). 0 for rule-based crews.
- **brainErrors.** Times a bot crashed while deciding; it keeps playing. Should be 0.
- **inputTokens.** Jev text sent; 0 for rule-based crews.
- **Callouts / suppressed.** Short phrases bots say to each other on the crew channel (Jev crews
  only); suppressed = not delivered because the same seat said the same phrase a moment ago.
- **Decisions file (`.events.jsonl`).** Every decision and press the bots made, for later analysis.
- **Recording (`.sgr`).** The game itself, frame by frame, saved by `--record`.
