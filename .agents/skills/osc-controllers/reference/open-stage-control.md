# Open Stage Control v1.x — integration reference

Verified against v1.30.3 (released 2026-04-28). Canonical repo: `https://framagit.org/jean-emmanuel/open-stage-control` (GitHub is a decommissioned placeholder). Docs: `https://openstagecontrol.ammd.net/docs/`. Client source files are `.mjs` (e.g. `src/client/widgets/common/widget.mjs`).

## Custom module

Loaded with `-c` / `--custom-module`. Lifecycle exports: `init()`, `stop()`, `reload()`, `unload()`, `oscInFilter(data)`, `oscOutFilter(data)`. Filters receive `{address, args, host, port}` (`oscOutFilter` also `clientId`); `args` items are `{value, type}`. Return the object to pass the message through, nothing to drop it.

Modules **hot-reload on file change**; timers and `app` listeners are reset, `module.exports.reload()` is called after, the `global` object persists.

### Globals in the module sandbox

| Global | Purpose |
|---|---|
| `app` | EventEmitter of server events (below) |
| `send(host, port, address, ...args)` | Send OSC/MIDI to any target — NOT limited to widget targets |
| `receive(host, port, address, ...args, {clientId})` | Simulate an incoming message to clients; `{clientId}` targets one client |
| `settings.read(name)` | Server option by long name without dashes (`"load"`, `"remote-root"`) |
| `settings.appAddresses()` | Server HTTP addresses |
| `loadJSON(path, errCb)` / `saveJSON(path, data, errCb)` | JSON file IO, path relative to module (absolute paths work) |
| `require(path)` | O-S-C's own splitter for multi-file modules (not Node require) |
| `nativeRequire(name)` | Real npm modules from a `node_modules` next to the module |
| `tcpServer`, `restartMidiBackend()` | TCP backend access; MIDI restart |
| plus | `console`, timers, `__dirname`, `__filename`, `process`, `global` |

### `app` events (from `src/server/node/ipc/callbacks.mjs`)

Callbacks get `(data, client)` where `client` = `{address, id}`. Key events:

- `open` — client connected (no widget data in payload)
- `close` — client disconnected
- `sessionSetPath` — **`data.path` = session file path** (absolute, server-resolved)
- `sessionOpened` — fires after a session opens successfully; `data.path` available
- `created` / `destroyed` — client lifecycle (reconnect/timeout)

**No event payload contains the widget tree**, and there is no `app.session` / widget registry in the sandbox.

### Enumerating the session's widgets (the supported way)

```js
module.exports = {
  init: () => {
    app.on('sessionSetPath', (data, client) => {
      const session = loadJSON(data.path)   // absolute path from the event
      const addresses = []
      const walk = (w) => {
        if (w.address) addresses.push({ address: w.address, preArgs: w.preArgs, target: w.target })
        for (const c of (w.widgets || [])) walk(c)
        for (const t of (w.tabs || [])) walk(t)
      }
      walk(session)
      // emit synthetic subscribe messages to Node-RED
      for (const a of addresses) send('NODE_RED_HOST', 9000, '/oscbridge/subscribe', a.address)
    })
  }
}
```

Alternative: `receive('/EDIT/GET', '<host>:<port>', 'root', {clientId})` makes a client reply with the full widget tree JSON; capture the reply in `oscOutFilter`. Remote-control commands are interpreted by **every** connected client — use `{clientId}` to avoid duplicate replies. Caveat for the `loadJSON` route: a session merely *imported* from a client device may not have a server-side path.

## Per-client sessions from one instance

- URL query options do NOT include session selection (full list: `hdpi`, `forceHdpi`, `doubleTap`, `zoom`, `framerate`, `desyncCanvas`, `lang`, `consoleLength`, `id`, `usePercents`, `noFocus`, `clientSync`, `altTraversing`, `virtualKeyboard`, `notifications`, `title`, `noWarning`).
- `--load session.json` loads that one session for ALL clients.
- **Working pattern:** each tablet connects with a stable `?id=<station>`; the custom module maps id → session path and issues `receive('/SESSION/OPEN', path, {clientId: client.id})` on `app.on('open')`.
- `--remote-root` confines file paths AND roots the in-app Session → Open dialog (which otherwise starts at the server's working dir — in Docker that's `$HOME`/`/root`, hiding a mounted sessions dir). Set it to the sessions mount (runtime-verified on v1.30.4); `--read-only` disables editing; `--remote-saving <regex>` restricts saving hosts.

## Inbound OSC matching & loops

- A received message updates every widget with the **same `address` and same `preArgs`** (ints and round floats treated equal). Remaining args become the value. Sender host:port is irrelevant (except MIDI, which matches on device targets).
- Inbound update does **not** re-emit. `/SET target id value` sets "as if interacted" and DOES emit. Scripting `set(id, v, {external: true})` simulates an inbound message (implies no send).
- `bypass: true` on a widget stops its normal emissions (scripted `send()` ignores `bypass`).
- Client option `clientSync=0` disables cross-client sync; widget target `self` loops a message back to the same client.
- **Reconnect/reload:** no automatic server-side value store. A reconnecting client syncs from other connected clients sharing `address`+`preArgs`+`targets`; otherwise values reset to defaults unless you use `--state`, `/STATE/SEND` ("make all widgets send their current value"), or a custom-module `/STATE/GET`→`/STATE/SET` pattern. For Starwards, initial-state sync comes from `ship-read` emitting on subscribe — this covers reconnects.

## Remote control API (v1, confirmed)

`/SET`, `/GET`, `/GET/#`, `/EDIT`, `/EDIT/MERGE`, `/EDIT/GET`, `/STATE/GET`, `/STATE/SET`, `/STATE/STORE`, `/STATE/RECALL`, `/STATE/SEND`, `/SESSION/OPEN`, `/TABS`. Sent to the server's OSC input port; replies go to the `target` (`ip:port`) argument.

## Session file format

JSON/JSON5. Root widget of `type: "root"`, children under `widgets` (or `tabs`); each widget has `type`, `id`, and for controls `address`, `preArgs`, `target`, `value`, plus styling props. Minimal example:

```json
{
  "type": "root",
  "id": "root",
  "widgets": [
    { "type": "fader", "id": "reactor_power", "address": "/reactor/power", "preArgs": [], "target": [], "value": 0 }
  ]
}
```

Addresses are matched **literally** — O-S-C does not apply OSC pattern-matching wildcards, so JSON-Pointer addresses like `/chainGun/isFiring` pass through untouched. No `version` field observed in sessions (unverified whether one exists); the editor auto-migrates deprecated widgets on open.

## Deployment (Docker/headless)

- **No npm package.** Download the release asset `open-stage-control-[version]-node.zip` from Framagit releases, extract, run `node /path/to/open-stage-control [options]` — pure Node, no Electron, no xvfb.
- Headless flags: `--no-gui` (no built-in client window). Typical: `node .../open-stage-control --no-gui --load /sessions/demo.json --port 8080 --osc-port 9001 --custom-module /modules/bridge.js`.
- Ports: `--port` = HTTP (default 8080); `--osc-port` = OSC UDP input (defaults to `--port`); `--tcp-port`/`--tcp-targets` optional.
- Config/cache live in an `open-stage-control` folder in the OS config location; override with `--cache-dir` and `--config-file` (default `cache-dir/config.json`). Mount sessions + these dirs as volumes.
- Pin the release version in `docs/DEPENDENCIES.md`.

## MIDI (v1)

Since v1.7.0 no Python/`python-rtmidi` — MIDI uses bundled `open-stage-control-midi` binaries. Widgets target `midi:device_name`; message addresses `/note`, `/control`, `/program`, `/pitch`, `/sysex` as in the docs.
