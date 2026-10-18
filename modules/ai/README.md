# @starwards/ai

Station brains that play Starwards by pressing one station's buttons, and the harness that trains them
in the headless game. Guide: [`docs/integration/ai-crew.md`](../../docs/integration/ai-crew.md).

```bash
npm run train -- --scenario T0 --seeds 8 --crew crews/reference.json
npm run decisions -- --recording <run.sgr> --md
npm run reask -- --recording <run.sgr> --brain brains/helms.v2.json
npm run read -- --recording <run.sgr> --station helms --t 40
```

Jev seats read `TYPESAFE_API_KEY` from `modules/ai/.env` (git-ignored).

The module has no build: its scripts run through ts-node over core, `@starwards/bots` and server source. Live bots are seated from the GM roster and run in the server.
The server runs the built `@starwards/core` and `@starwards/bots`, so run `npm run build:core` after a core change and `npm run build:bots` after a core or bots change.
