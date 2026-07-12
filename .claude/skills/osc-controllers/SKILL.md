---
name: osc-controllers
description: Use when working on the OSC controller framework - Open Stage Control layouts/custom modules, Node-RED OSC bridge flows, tablet touch controllers, or Playwright E2E tests that drive Open Stage Control widgets. Also use when debugging OSC message routing, widget feedback loops, or O-S-C deployment in Docker.
version: 2026-07-04
related_skills:
  - starwards-tdd (E2E-first workflow)
  - starwards-verification (evidence before claiming done)
---

# OSC Controllers (Open Stage Control ⇄ Node-RED ⇄ Starwards)

Touch/MIDI control surfaces via Open Stage Control (O-S-C), bridged to the game by Node-RED. Convention: **widget OSC address = admitted JSON Pointer** (e.g. fader address `/reactor/power`). All facts verified against O-S-C **v1.30.3** primary sources (Framagit source + official docs); provenance in `docs/reference/open-stage-control-reference.md`.

## Critical facts (agents get these wrong from memory)

1. **O-S-C is NOT on npm.** `npm install open-stage-control` fails — no such package. Deploy from the Framagit release asset `open-stage-control-[version]-node.zip` (pure Node, no Electron/xvfb) and run `node /path/to/open-stage-control --no-gui ...`. There is no `--headless` flag; the flag is `--no-gui`.
2. **The user-defined widget `id` is NOT in the DOM.** Widget containers are `<div class="widget {type}-container" id="{hash}" data-widget="{hash}">` where `{hash}` is an internal uuid. Resolve widgets in tests via `el._widget_instance` (see [reference/playwright-testing.md](reference/playwright-testing.md)).
3. **A custom module cannot read the widget tree directly.** Enumerate widgets by listening to `app.on('sessionSetPath')`/`app.on('sessionOpened')` (payload has the session file path) and walking the file with `loadJSON(path)`.
4. **Per-client sessions are NOT selected by URL.** No `?session=`/`?load=` query param exists. One instance serves per-station sessions via custom module: client connects with `?id=<station>`, module calls `receive('/SESSION/OPEN', <path>, {clientId})`.
5. **Inbound OSC does not loop by default.** A message matching a widget (by `address` + `preArgs` only — sender host:port is ignored) updates the display without re-emitting. `/SET` and user interaction DO emit. `bypass: true` stops a widget's own emissions.
6. **Canvas widgets (fader/knob/xy) never show their value in the DOM.** Read values via the widget instance, not DOM scraping.

## Quick reference

| Task | Where |
|---|---|
| Custom module globals, `app` events, widget enumeration, per-client sessions | [reference/open-stage-control.md](reference/open-stage-control.md) |
| Inbound matching, feedback/loop rules, reconnect/state behavior | [reference/open-stage-control.md](reference/open-stage-control.md) |
| Session file JSON format, deployment (`-node.zip`, `--no-gui`, cache/config dirs) | [reference/open-stage-control.md](reference/open-stage-control.md) |
| Locating/driving/reading widgets in Playwright | [reference/playwright-testing.md](reference/playwright-testing.md) |
| OSC message encoding, type tags, bundles, UDP vs TCP/SLIP | [reference/osc-protocol.md](reference/osc-protocol.md) |
| node-red-contrib-osc msg shapes, type casting, udp wiring | [reference/node-red-osc.md](reference/node-red-osc.md) |

## Architecture (this repo)

- Write path: O-S-C widget → UDP → Node-RED `udp in` → `osc` decode → `ship-write` (JSON Pointer admission enforces safety — no new server surface).
- Feedback path: `ship-read` → RBE filter → per-topic rate limit → `osc` encode → `udp out` → O-S-C (matches widgets by address, no loop).
- Subscription: O-S-C custom module walks session on load → synthetic subscribe messages → `ship-read` dynamic patterns (see SPEC-0002 in the design repo).

## Common mistakes

| Mistake | Reality |
|---|---|
| `npm install -g open-stage-control` | Package doesn't exist; use Framagit `-node.zip` release asset |
| `--headless` flag | It's `--no-gui` |
| `page.locator('#my_widget_id')` | DOM id is the internal hash; use `_widget_instance.getProp('id')` |
| Expecting `?session=x.json` per tablet | Use `?id=<station>` + custom module `/SESSION/OPEN` with `{clientId}` |
| Fearing feedback loops from `udp out` → O-S-C | Plain inbound match doesn't re-emit; only `/SET`/interaction do |
| Assuming widget targets constrain inbound matching | Matching is address + preArgs only (targets matter for MIDI and outbound) |

## Verify hands-on (source-verified, not yet runtime-verified)

- The `_widget_instance` Playwright recipe against a live v1.30.3 client (first E2E run validates this).
- Inner DOM of `toggle`/`push`/`xy` widgets (base structure confirmed; per-type internals not read from source).
- Whether session files carry a `version`/migration field.
