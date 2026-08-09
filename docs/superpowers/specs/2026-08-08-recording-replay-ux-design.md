# Recording & replay UX

The recording/replay feature works, but the game master cannot tell what it is doing. Control
lives in the lobby, recording state is invisible while running a game, stopping gives no
confirmation, a finished replay silently sits on its last frame, and player stations are
unreachable while a recording plays back.

## Goals

1. Recording is started, stopped and observed from the GM screen.
2. The GM can always see that a recording is in progress, from any dashboard tab.
3. Stopping a recording confirms what was saved.
4. A replay can be rewound, and an ended replay says so and can be restarted.
5. Stations can be opened during a replay and behave as viewers, not controllers.

## Non-goals

- Recording controls or a REC indicator on player stations. Recording is production state; the
  crew is in fiction.
- An index format for recordings. A backward seek re-reads from frame 0, as today.

## State (`modules/core/src/admin`)

`AdminState` gains three synced fields, so every surface reads pushed state instead of polling
HTTP:

| Field              | Type      | Owner          | Meaning                                                 |
| ------------------ | --------- | -------------- | ------------------------------------------------------- |
| `recordingSeconds` | `float32` | `GameRecorder` | Seconds of game time captured so far; `0` when idle.    |
| `recordingName`    | `string`  | `GameRecorder` | File name being written; empty when idle.               |
| `replayEnded`      | `boolean` | `ReplayPlayer` | The replay reached the last frame and is holding there. |

`isRecordingGame` stays the on/off truth. `replayEnded` is cleared by any seek and by
`startReplay`.

## GM screen

### Game Controls widget

`modules/browser/src/widgets/game-transport.ts` becomes `game-controls.ts`; the widget name
becomes `game controls` and its pane title `Game Controls`. It is registered as before and added
to the default GM layout as the tab after `create` in the right-hand stack (`screens/gm.ts`), and
is the stack's active tab on load. The GM layout is not persisted in `localStorage`, so the
default applies on every load.

Contents:

- Rate buttons (`pause`/`slow`/`play`/`fast`) and the rate slider — unchanged.
- Replay only: position readout, scrub slider, `-10s` and `-30s` step-back buttons, and a
  `restart` button enabled when `replayEnded` (seek to 0, rate back to play). Step-back and
  restart exist because dragging a 0..1 slider to a specific moment is impractical.
- Recording: a `Record` / `Stop Recording` button, an elapsed readout (`REC 02:14`) driven by
  `recordingSeconds`, and a `last saved` line holding the result of the most recent stop.

### Status chip

The chip in `widgets/observation-mode.ts` generalizes into a shared module mounted on the GM
screen root as well as on station screens. It is fixed-position, so it stays visible whichever
dashboard tab has focus.

- GM: `REC ● mm:ss` while recording; `REPLAY mm:ss / mm:ss` with a `HELD` or `ENDED` suffix
  during replay. Both can show at once only in the sense that recording and replay are mutually
  exclusive game statuses — the chip renders whichever applies.
- Stations: the replay half only, exactly as today.

## Server

### Stop feedback

`POST /stop-recording` returns the finished recording's summary (`name`, `durationSeconds`,
`frameCount`) as JSON. `GameRecorder.stopRecording()` summarizes the file after the in-flight
write settles and before `finalize()` clears `filePath`. `AdminDriver.stopRecording()` stops
being fire-and-forget and resolves with that summary, which the widget renders.

### Replay end

`ReplayPlayer`'s end-of-file path sets `replayEnded` in addition to holding the rate at 0.
`seekTo()` clears it.

### Station commands during replay

`GameManager` passes an `isReplaying: () => boolean` predicate into `ShipRoom`'s create options.
`ShipRoom` wraps both the typed `repairCommands` receivers and the `'*'` JSON-pointer handler:
while the predicate is true the message is dropped. A viewer at a station therefore cannot fire a
recorded ship's guns or steer it. GM and admin surfaces are unaffected — the GM is meant to drive
the replay.

## Lobby

`components/lobby.tsx` renders the GM card and the ship cards whenever the game status is
`RUNNING` **or** `REPLAY`, so every station link is reachable during playback. During `REPLAY`
the mutating controls (Save Game, Record, Stop Game) are hidden; the existing replay banner and
its Stop button remain. This means splitting `InGameMenu` so the cards and the controls are
gated separately.

## Testing

- **Core**: the three new `AdminState` fields sync to clients.
- **Server**: `GameRecorder` publishes `recordingSeconds` and `recordingName`;
  `POST /stop-recording` returns a summary matching the written file; `ReplayPlayer` sets
  `replayEnded` at end of file and clears it on seek; `ShipRoom` drops typed and JSON-pointer
  commands while replaying and accepts them while running.
- **Browser**: gallery scene for the Game Controls widget in each state — live, recording,
  replaying, ended.
- **E2E**: the lobby offers ship station links during a replay and hides Save/Record/Stop Game.
