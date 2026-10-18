# Play one seat with bot crewmates

You play one bridge seat; the GM seats bots on every other seat of the same ship, live, in the same
game. Bots run inside the game server, so there is nothing to launch beside it.
Developer reference for the bots: [`docs/integration/ai-crew.md`](../integration/ai-crew.md).

## Prerequisites

- The repo checked out, dependencies installed (`npm install` at the repo root), Node as in
  [`DEPENDENCIES.md`](../DEPENDENCIES.md).
- No API key. The only bot is the rule-based `reference` crew.

## Step by step

### 1. Start the game server

From the repo root:

```bash
npm run dev
```

Wait until it prints `Project is running at: http://localhost:3000/`. Leave it running. The game
server is `http://localhost:8080`, the screens are on `http://localhost:3000`.

### 2. Start a round

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

### 3. Seat the bots from the GM roster

Open the GM screen, http://localhost:3000/gm.html, and find the **Station Roster** panel. It has one
row per seat of each player ship, with the seat's bot status (`none`, or the brain and `starting`,
`running` or `failed: <message>`), bot buttons, and one client dropdown per screen of the seat.

For every seat you do not play, press **seat reference**. The server starts the bot on that seat.
**remove** stops a seated bot; **restart** appears when a bot failed and starts it again. A seat's bot
buttons are disabled while another seat's bot plays its station (a `tactical` bot plays both pilot and
weapons); hover them for which seat. Bots are removed when the game stops, restarts or loads, so seat
them again after each restart.

Above the ships, **reset assignments** unassigns every screen and stops every bot, including clients
that left and still hold a screen the roster does not list. While bots run and the game is not
recorded, the roster shows a **bots running, not recording** banner.

| Seat       | Screens                         |
| ---------- | ------------------------------- |
| `pilot`    | helms                           |
| `weapons`  | weapons                         |
| `engineer` | engineer                        |
| `sigint`   | signals, dradis, target-details |
| `tactical` | none (bot only)                 |

A seat with screens but no bot and no client on any of them is marked `UNASSIGNED`. The `sigint` bot
plays the signals station; no bot plays Dradis. The `tactical` bot flies and fights as one station
(helms and weapons together), so seat it instead of the `pilot` and `weapons` bots, not alongside them.

### 4. Take your seat

Open your seat's screen:

| Your seat    | Open                                          | Input    |
| ------------ | --------------------------------------------- | -------- |
| Pilot        | http://localhost:3000/helms.html?ship=GVTS    | keyboard |
| Weapons      | http://localhost:3000/weapons.html?ship=GVTS  | keyboard |
| Engineer     | http://localhost:3000/engineer.html?ship=GVTS | keyboard |
| Signals      | http://localhost:3000/signals.html?ship=GVTS  | keyboard |
| Dradis       | http://localhost:3000/dradis.html?ship=GVTS   | mouse    |
| GM (observe) | http://localhost:3000/gm.html                 | mouse    |

The GM assigns your client to a seat from the roster's "Unassigned clients" list. A screen can attach to a seat a bot holds: input is shared, so do not press **seat reference** on your own seat (press **remove** if a bot is there).

### 5. What you should see when it works

- In the roster, the bot seats show `reference` and the seat you play shows your client.
- In game, within seconds: weapons locks the target and fires, the engineer changes power, signals scans.

### 6. Record and download

The server records every game from its start. Press **Stop Recording** in the GM screen's **Game
Controls** to end it, and **Record** to start a new one. While the server records, every bot decision
is written beside the recording as `<recording>.events.jsonl`.

The download of the stopped recording offers the `.sgr` and its `.events.jsonl` together. The
Recordings menu in the lobby lists every saved recording with a `decisions` link for its sidecar.

Analyse a recording's decisions per control (confidence, fallbacks, flips):

```bash
npm --prefix modules/ai run decisions -- --recording <file>.sgr --low 10
```

`--low <n>` also lists the n least confident decisions with their time; `--md` prints a markdown table.
The command reads `<file>.events.jsonl` beside the `.sgr`.

### 7. Restart a round

1. Stop the game:
   `curl -X POST http://localhost:8080/stop-game` (PowerShell:
   `Invoke-RestMethod -Method Post -Uri http://localhost:8080/stop-game`).
2. Start it again (step 2) and reload your browser tab.
3. Seat the bots again (step 3).

## Comparing your session with the all-bot baseline

The question: does the ship do as well with you in the seat as with a bot there?

- **Baseline (authoritative):** the committed headless run of the all-bot `reference` crew on `T1`,
  [`modules/ai/curriculum/baselines/reference.json`](../../modules/ai/curriculum/baselines/reference.json):
  **kills 16 of 16 rounds, median 38.7 s to kill**. It is what the curriculum table in
  [`ai-crew.md`](../integration/ai-crew.md#curriculum) shows and what regressions are judged against.
  A re-run on 2026-10-16 gave 16/16, median 42.1 s; the suite judged that the same as the baseline
  (seed noise).
- **Your session:** record the round (step 6) for 180 s. Ask the recording when the attacker and your ship died:

    ```bash
    npm --prefix modules/server run analyze -- sql "SELECT object_id, t FROM event WHERE kind='despawn' AND object_id IN ('target','GVTS')" --recording <file>.sgr
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

## Common failures

| Symptom                                                      | Cause                                          | Fix                                                           |
| ------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------- |
| The roster has no ships                                      | No round running, or the server is not up      | Do steps 1-2.                                                 |
| A seat's bot status is `failed`                              | The bot could not start on that seat           | Read the message in the seat's bot status; press **restart**. |
| The bots are gone after a restart                            | Bot choices reset when the game stops or loads | Seat them again (step 3).                                     |
| No `decisions` link beside a recording                       | The recording was stopped while the bots ran   | Press Record to keep the next ones (step 6).                  |
| A bot stays `starting`; the server log repeats `brain error` | Its brain throws every turn                    | Report the logged message; press **remove** to free the seat. |

## Glossary

- **Station / seat.** A station is one bridge job and its screen: `helms` (the Pilot), `weapons`,
  `engineer`, `signals`, `dradis`. A seat is one place on the bridge that a human or a bot plays; it
  spans one or more screens.
- **Crew file.** A small JSON file in `modules/ai/crews/` listing the seats and, for each, which brain
  and which policy plays it. The headless suite and training read them.
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
- **Decisions file (`.events.jsonl`).** Every decision and press the bots made while the server recorded, for later analysis.
- **Recording (`.sgr`).** The game itself, frame by frame, saved from the game's start until the GM stops it.
