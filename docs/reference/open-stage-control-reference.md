# Open Stage Control v1.x — Primary-Source Resolution of Open Questions

**Bottom line:** A custom module **cannot enumerate the loaded session's widgets on its own** (no session/widget-tree object is exposed and no event payload carries widget data), but it **can obtain every widget's OSC address/preArgs/target** by capturing the session file path from the `sessionSetPath`/`sessionOpened` events and reading it with `loadJSON`, or by issuing `/EDIT/GET` to its own server via `receive()` — so Q1 is **PARTIAL**. One O-S-C instance **cannot** serve a different session per client via the URL (there is no `session=`/`load=` query option), so Q2 is **REFUTED** for the URL mechanism, but it **is achievable via a custom module** that calls `/SESSION/OPEN` per-client. All findings below are drawn from the v1 docs site (openstagecontrol.ammd.net, MkDocs generator, latest stable **v1.30.3**) and the canonical source on Framagit. Note: `github.com/jean-emmanuel/open-stage-control` is now only a placeholder ("Open Stage Control is no longer on Github"); source lives on Framagit, which I read via raw file fetches.

---

## Q1. Custom module API — can it enumerate the loaded session's widgets?

### Module globals (v1) — from https://openstagecontrol.ammd.net/docs/custom-module/custom-module/

Complete list of globals available in the restricted sandbox:

| Global                                           | Signature / purpose                                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`                                            | Node.js `EventEmitter`; monitors events from clients. Event names come from `callbacks.mjs`; callbacks receive `data` (object) and `client` (`{address, id}`). |
| `receive(host, port, address, ...args, options)` | Simulate an incoming OSC/MIDI message to clients. `options` = `{clientId: id}` targets one client. `host`+`port` may be a single colon-joined string.          |
| `send(host, port, address, ...args)`             | Send OSC/MIDI to a target (same arg convention as `receive`).                                                                                                  |
| `settings.read(name)`                            | Returns a server option by long name without dashes (e.g. `"send"`, `"load"`, `"read-only"`, `"remote-root"`).                                                 |
| `settings.appAddresses()`                        | Returns the server's HTTP addresses.                                                                                                                           |
| `loadJSON(path, errorCallback)`                  | Loads a JSON file; path relative to the custom module's location.                                                                                              |
| `saveJSON(path, data, errorCallback)`            | Saves an object/array as JSON; path relative to module location.                                                                                               |
| `require(path)`                                  | O-S-C's own splitter (not Node's `require`) for multi-file modules.                                                                                            |
| `nativeRequire(moduleName)`                      | Loads native Node/npm modules if a `node_modules` folder exists next to the module.                                                                            |
| `tcpServer`                                      | Raw access to the server's TCP backend (`tcpServer.clients[ip].port` etc.).                                                                                    |
| `restartMidiBackend()`                           | Restart the MIDI backend without restarting the server.                                                                                                        |
| Other JS globals                                 | `console`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `__dirname`, `__filename`, `process`, `global`.                                       |

Module lifecycle exports: `init()`, `stop()`, `reload()`, `oscInFilter(data)`, `oscOutFilter(data)`, `unload()`. `oscInFilter`/`oscOutFilter` receive `{address, args, host, port}` (out also has `clientId`); `args` is an array of `{value, type}`.

### App events (v1) — from source `src/server/node/ipc/callbacks.mjs` (Framagit, master)

I read the actual `Callbacks` class. The `app` EventEmitter fires the class's method names. The critical fact: **none of these event payloads contains the session content or the widget tree.** The events and their payloads are:

- **`open(data, clientId)`** — client connected. On connect the server sends `connected`, `sessionList` (recent sessions), `clipboard`, `serverTargets`. If `settings.read('load')` is set and not a hot-reload, it triggers `sessionOpen({path: settings.read('load')})`. Payload has **no** widget data.
- **`close(data, clientId)`** — client disconnected (empty body).
- **`created` / `destroyed`** — client created/reconnected, and removed on timeout. `destroyed` clears `this.widgetHashTable[clientId]`.
- **`sessionSetPath(data, clientId)`** — stores the client's current session file path: `this.ipcServer.clients[clientId].sessionPath = data.path`. **`data.path` is the session file path** — this is the reachable path.
- **`sessionOpen(data, clientId)`** — reads the session file and sends `sessionOpen` with `{path, fileContent}` to that client. `fileContent` is the parsed session, but this is a **method the server calls / IPC message to the client**, not an `app` event whose payload the module receives with widget data. (The docs' examples listen to `sessionOpened`, which fires *after*.)
- **`sessionOpened(data, clientId)`** — fires after a session file opens successfully; handles `state` loading and calls `sessionSetPath({path: data.path})`. Docs examples use `app.on('sessionOpened', (data, client)=>{...})` to detect "client connected and in a session."
- **`addWidget(data, clientId)`** / **`removeWidget(data, clientId)`** — these cache each widget's OSC data server-side in `widgetHashTable`. **`data` = `{hash: 'widget_uuid', data: {target:[...], preArgs:[...], address:'/address', typeTags:'iif'}}`.** This is the one internal channel that carries per-widget address/preArgs/target, but it is an internal IPC callback, not a documented app event, and `preArgs`/`target` may be empty strings.
- Other events: `clipboard`, `sessionAddToHistory`, `sessionRemoveFromHistory`, `fragmentLoad`, `fileRead`, `fileSave`, `stateOpen`, `sessionSave`, `stateSave`, `syncOsc`, `sendOsc`, `reload`, `reloadCss`, `log`, `error`, `errorLog`, `errorPopup`, `listDir`.

The docs example (Dynamic widget creation) confirms the event names in the public API:
```js
app.on('sessionOpened', ()=>{ create_widgets() })
app.on('sessionSetPath', (e)=>{ if (e.path === '') { create_widgets() } })
```
and the client-tracking example:
```js
app.on('open',  (data, client)=>{ ...client.id... })
app.on('close', (data, client)=>{ ...client.id... })
```

### Can a module enumerate the session's widgets and read each address/preArgs/target?

Three mechanisms evaluated:

1. **A session object reachable from `app`** — **No.** There is no `app.session`, no widget registry, and no global exposing the widget tree in the sandbox. `Callbacks` keeps `widgetHashTable` (server-side OSC cache) but it is not handed to the module. **Blocker: no exposed session/widget object.**

2. **Get the file path from an event and read it with `loadJSON`** — **Yes.** `sessionSetPath`/`sessionOpened` deliver `data.path` (the absolute `.json` session path, resolved server-side). A module can `app.on('sessionSetPath', e => { const session = loadJSON(e.path); /* walk session.widgets recursively */ })`. Each widget node contains its `address`, `preArgs`, and `target` literally (see the session JSON in Q5). This is the most robust enumeration mechanism. Caveat: `loadJSON` resolves paths relative to the module's location, so an absolute path is required (the event supplies one); a client that only *imported* a session from the device filesystem may not set a server-side path.

3. **`/EDIT/GET` remote-control command** — **Confirmed present in v1** (https://openstagecontrol.ammd.net/docs/remote-control/). Two forms:
   - `/EDIT/GET target id` → replies `/EDIT/GET id data` (JSON-stringified widget **including its children**).
   - `/EDIT/GET target address preArg1 …` → replies with the widget's data by address.
   A module **can** invoke it against its own server: call `receive('/EDIT/GET', '<host>:<port>', 'root', {clientId: id})` to make a client emit the whole tree from `root` to the given `target` address, then capture the reply in `oscOutFilter` (the same pattern the docs' "Auto-save client state" example uses with `/STATE/GET`). This yields the full widget tree with every `address`/`preArgs`/`target`. Note the docs warning: remote-control commands are interpreted by **every connected client**, so with multiple clients you get multiple replies — use `{clientId}` to target one.

**Verdict for "a custom module can, on session load or client connect, obtain every widget's OSC address": PARTIAL / effectively CONFIRMED with a mechanism.**
- Directly from an event payload or a session object: **REFUTED** (no such payload/object).
- Via `sessionSetPath`→`loadJSON(path)` **or** `/EDIT/GET root` captured in `oscOutFilter`: **CONFIRMED**. Exact blocker for the "direct" path: no in-memory widget registry is exposed to the sandbox; you must read the file or round-trip through a client.

### Hot-reload of custom modules
**Yes.** Per the Autoreload section: "Custom modules (including submodules loaded with `require()`) are reloaded automatically when they are modified. Upon reload, timers … and event listeners (added to the `app` object) are reset. After each reload the `module.exports.reload()` function (if any) is called. The `global` object persists across reloads." Native modules (`nativeRequire`) may need `module.exports.unload` to release resources (e.g. bound ports).

---

## Q2. One server instance, different session per client URL

### Full list of v1 client URL query options — from https://openstagecontrol.ammd.net/docs/client-options/

Set via `?param=value&param2=value2` on the server URL (or globally via `--client-options`). The **complete** list is:

`hdpi`, `forceHdpi`, `doubleTap`, `zoom`, `framerate`, `desyncCanvas`, `lang` (en/fr/de/pl), `consoleLength`, `id` (client's unique id), `usePercents`, `noFocus`, `clientSync` (0 disables cross-client sync), `altTraversing`, `virtualKeyboard`, `notifications`, `title`, `noWarning`.

**There is no `load=`, `session=`, or equivalent query option.** The URL cannot select which session file a client loads. (The community has explicitly asked for `?session=…`; it does not exist in v1.)

### How sessions actually load
- Server option **`--load <path.json>`**: "Path to a session file (.json). **All clients** connecting the server will load it." (Server configuration page.) It is one session for all clients — not per-client, and not multiple `--load` values.
- Path/security rules that govern any session file reading (from `callbacks.mjs`): `remote-root` — non-absolute paths are resolved under `remote-root`, and file browsing/saving is prevented outside it (`if (root && !path.normalize(p).includes(path.normalize(root))) p = root`). `read-only` disables editing/saving. `remote-saving` restricts saving to hosts matching a regex. These constrain where session/state files can be read/written.

### One-instance mechanisms for per-client sessions
- **URL:** No. (REFUTED for the URL mechanism.)
- **Custom module (works):** A module can track clients via `app.on('open'/'sessionOpened', (data, client)=>…)` and then issue `receive('/SESSION/OPEN', '/path/to/that-clients-session.json', {clientId: client.id})` — `/SESSION/OPEN path.json` is a documented v1 remote-control command, and `receive(..., {clientId})` targets a single client. This is the supported way to give different clients different sessions from one instance.
- **Client id routing:** the `id` client option lets you assign stable per-client ids (used with `{clientId}` targeting), but it selects the *client*, not the *session*.

**Verdict for "one O-S-C instance can serve a different session per client URL": REFUTED via URL** (no `session=`/`load=` query parameter exists; `--load` is global to all clients). **However, per-client sessions ARE achievable from one instance via a custom module** using `/SESSION/OPEN` addressed with `{clientId}`.

---

## Q3. Client DOM structure for Playwright testing

**Sourcing note:** The client source files are `.mjs`, not `.js` (e.g. `src/client/widgets/common/widget.mjs`); with the correct extensions the Framagit raw endpoints work. The DOM facts below were verified directly from `widget.mjs`, `sliders/fader.mjs`, `events/drag.mjs`, and `managers/widgets.mjs` (master, ≈v1.30.3).

**Verified DOM structure (from `src/client/widgets/common/widget.mjs`):** every widget's root element is

```html
<div class="widget {type}-container" id="{hash}" data-widget="{hash}"></div>
```

where `{hash}` is the widget's internal uuid — **the user-defined widget `id` is NOT in the DOM**; `id`/`data-widget` carry the hash. The container element also gets a direct back-reference: `this.container._widget_instance = this`. The client's `widgetManager` (`src/client/managers/widgets.mjs`) indexes widgets by hash (`this.widgets[hash]`), by user id (`idRoute`), and by OSC address (`addressRoute`), with `getWidgetById(id)` / `getWidgetByAddress(address)` — but it is module-scoped (ES export), **not** exposed on `window`.

**Playwright recipe that follows from this:** locate widgets from `page.evaluate` via the element back-reference, not CSS ids:

```js
// find a widget by its user-defined id or address, read its value
const value = await page.evaluate((wantedId) => {
  for (const el of document.querySelectorAll('[data-widget]')) {
    const w = el._widget_instance
    if (w && w.getProp('id') === wantedId) return w.getValue()
  }
}, 'reactor_power')
```

Type-level selectors are available in CSS (`.widget.fader-container`), but stable per-widget selection must go through `_widget_instance.getProp('id')` (or `address`).

**What is verified from primary docs:**
- **Widgets are a mix of DOM and canvas.** The Properties reference lists canvas-drawn value widgets (fader, knob, xy, multixy, range, the `canvas` widget, visualizers, LEDs) versus DOM widgets (text, input, dropdown/menu, switch, buttons, HTML/SVG). The Canvas widget page confirms sliders/pads/xy render to a `<canvas>` via an `onDraw` script with a `ctx` 2D context; values there are **canvas-only** (not reflected as DOM text).
- **Unified DOM structure + `:host`.** The changelog (v1.0.0) states v1 "unified (kind of) [the] DOM html structure for widgets" and that "known CSS tricks will require adjustments," and the more-detached-DOM change for nested canvas widgets. The CSS Tips page shows widgets are styled via a **`:host`** selector, i.e. each widget is a custom element / shadow-host-like container, and it explicitly tells users to use the browser DevTools inspector (Ctrl+Shift+C) to find the class names — implying widget id/type is carried on the widget's root element and CSS classes.
- **Value observability:** For DOM widgets (text/input/switch/button) the value is in the DOM (input value / text content). For canvas widgets (fader/knob/xy/multixy) **the value is not in the DOM** — it is drawn on the canvas.
- **Client-side JS handle (verified route for canvas values):** The Scripting page documents client-side functions usable for reading values: `get(id)` "Returns the value of the first matching widget" and `getProp(id, name)`. Combined with the remote-control `/GET` command, this means values are reachable programmatically. In practice, from Playwright `page.evaluate`, the reliable value read is via the widget instance rather than DOM scraping: the client's `widgetManager` is module-scoped (not on `window`), but every widget container exposes `el._widget_instance` (verified in `widget.mjs`), giving access to `getValue()` and `getProp()`.

**Input events (verified from `src/client/events/drag.mjs`):** the client listens to **pointer and touch events**, not mouse events: `document.addEventListener('pointerdown'/'pointermove'/'pointerup', ...)` plus `touchstart`/`touchmove`/`touchend`/`touchcancel` (and force-touch variants), and synthesizes internal `draginit`/`drag`/`dragend` events dispatched to widgets. Playwright's `page.mouse` generates pointer events in Chromium, so `mouse.down/move/up` drives single-pointer widgets (fader, knob, xy); multi-touch widgets (multixy, per-handle range) need touch-event dispatch. Fader (`src/client/widgets/sliders/fader.mjs`) confirms canvas rendering — value is drawn to `<canvas>`, never in the DOM; use the `_widget_instance` recipe above for assertions.

**Input semantics (from docs — General mechanics):** Widgets respond to **Mousedown/Tap (at press), Click (at release), Double Click/Double Tap, and Drag** with a 1:1 ratio; `Ctrl`+drag (mouse) or two-finger drag (touch) gives 10× precision. Because the same widgets handle both mouse and touch and support multi-touch (multixy, range) and touch-state events, the client uses **pointer/touch events**, not mouse-only. **Implication for Playwright:** `page.mouse` down/move/up will drive single-pointer widgets (fader/knob/single xy) for basic value changes, but multi-touch widgets (multixy, range per-handle) and any touch-specific behavior require dispatching **pointer/touch events** (e.g. `dispatchEvent` of `pointerdown`/`pointermove`/`pointerup` or touch events), not `page.mouse`. The changelog also notes touch-specific bugs (e.g. `touchend` on detached elements), confirming genuine touch-event handling.

**Recommendation for Playwright value assertions:** don't scrape canvas pixels. Instead read values through the client API in `page.evaluate` (via the documented `get()`/`getProp()` scripting functions or by sending `/GET` and capturing the reply), and drive canvas widgets with pointer-event dispatch at computed coordinates. The root-element structure is now verified from source (see above): select containers by `.widget.{type}-container` / `[data-widget]`, and resolve user ids through `el._widget_instance.getProp('id')`.

---

## Q4. Inbound OSC matching and loop behavior — from https://openstagecontrol.ammd.net/docs/widgets/general-mechanics/

**Inbound matching keys.** "When an osc message is received, it updates every widget that meets the following conditions: same `address`; same `preArgs` (no distinction between integers and round floats). The remaining arguments after `preArgs` are passed to the widget." So matching is on **address + preArgs only**. The sender's `host:port` does **not** affect OSC matching (it matters only for MIDI: "only the widgets that include the emitting MIDI device in their targets will be able to receive it"). Since your widget addresses are literal JSON Pointers like `/reactor/power`, matching is literal on that address string plus any preArgs.

**Does an inbound-updated widget re-emit?** By default **no** — receiving an OSC message updates the widget's displayed value without making it send. The docs distinguish this from `/SET`, which "Set[s] a widget's value **as if it was interacted with** from the interface. This is likely to make it send its value," and from scripting `set(..., {external:true})` which "simulates a value coming from an osc/midi message (implies `send:false`)." So a plain inbound value match does not loop; `/SET` (and user interaction) does emit.

**`bypass` property (v1).** From General mechanics: "Widgets with `bypass` set to `true` will not send synchronization messages to other clients." The changelog adds that scripting `send()` "ignores the widget's `bypass` property (allows bypassing default messages and define custom ones)." So `bypass` suppresses a widget's normal outbound/sync emission (useful to break loops), but explicit `send()` in a script overrides it.

**Global loopback-related server options.** There is no dedicated "loopback" toggle. Relevant controls: the `clientSync` **client** option (0 disables cross-client sync); a widget `target` of **`self`** routes a message back into the same server/client (seen in `sendOsc` in `callbacks.mjs`: `if (targets[i] === 'self') this.ipcServer.send('receiveOsc', data, clientId)`); and the server `send` default targets. To avoid loops with Node-RED, keep your game-server return path on a distinct address or use `bypass`/`{send:false}`.

**On client reload/reconnect — does the server push current values?** Not automatically from a live in-memory store; O-S-C is largely stateless per client. Values are re-established by: (a) the `state`/`--load` mechanism — `sessionOpened` loads a `.state` file if `--state` is set, and only makes the client send if it's the sole active client; (b) **cross-client sync** — if another client is already connected, the reconnecting client syncs widgets that share `address`+`preArgs`+`targets`; (c) explicit `/STATE/SEND` ("Make all widgets send their current value") or a custom-module `/STATE/GET`+`/STATE/SET` pattern (documented example). So a fresh reconnect with no other clients and no `--state` file starts at default values unless you push state via a custom module or `/STATE/*`.

---

## Q5. Quick facts

**Current stable v1.x.** **v1.30.3, released 2026-04-28** (Framagit releases API; preceding releases: v1.30.2 2026-03-02, v1.30.1 2026-01-08, v1.30.0 2025-12-30).

**Distribution + headless (no-Electron) run.**

- **There is NO npm package.** `registry.npmjs.org/open-stage-control` returns 404 and registry search has no such package (verified 2026-07-04); the `package.json` name is repo-internal only. Distribution is via Framagit release assets: platform binaries and **`open-stage-control-[version]-node.zip`** for pure-Node deployments. ⚠️ **Spec impact:** SPEC-0002 Open Question 5's default ("official Node image running the `open-stage-control` npm package") is not viable — the Docker image must download/extract the `-node.zip` release asset (or build from source) instead.
- Two headless modes (from Running with node):
  - **Lite headless via Electron's Node:** `ELECTRON_RUN_AS_NODE=1 open-stage-control /path/to/open-stage-control/resources/app/ [options]` (lower CPU/RAM).
  - **Pure Node.js (no Electron):** download `open-stage-control-[version]-node.zip`, extract, then `node /path/to/open-stage-control [options]`. From electron package: `node …/resources/app`; from sources: `node …/app`.
  - Add `--no-gui` to disable the built-in client window (headless server). Full headless launch example from the docs: `open-stage-control --no-gui --load path/to/session.json --theme path/to/theme.css`.
- **Config/session file locations (for Docker volumes):** In v1, "cache and config files are now stored in a folder named **`open-stage-control`** (located in the system's default location for config files). The `.open-stage-control` [dotfile] is no longer used." Override with `--cache-dir` (browser cache + localStorage) and `--config-file` (session history + launcher config; defaults to `cache-dir/config.json`). For Docker, mount your session `.json` files at a fixed path and pass `--load`, and volume-mount `--cache-dir`/`--config-file` to persist history/config. Electron headless in Docker needs a virtual framebuffer (`xvfb-run`); the pure-Node package avoids that.

**Session file format (minimal real v1 session).** Sessions are JSON/JSON5. A session is a single root widget (type `root`/panel) whose `widgets` array holds children; each widget carries `type`, `id`, and (for controls) `address`, `preArgs`, `target`. A minimal illustrative v1 session with a root and one fader with an address:
```json
{
  "type": "root",
  "id": "root",
  "widgets": [
    {
      "type": "fader",
      "id": "reactor_power",
      "address": "/reactor/power",
      "preArgs": [],
      "target": [],
      "value": 0
    }
  ]
}
```
This structure is confirmed by the docs' Dynamic-widget-creation example (widgets nested under a container with `type`, `id`, `address`, `preArgs`) and by cookbook session widget objects (e.g. `{ "mode":"momentary", "address":"/cue/#{$+1}/start", "label":"Q#{$+1}" }`). **Migration/version fields:** I did not find an explicit `version` key documented in the session schema in v1 primary sources — **UNVERIFIED**; the editor auto-migrates deprecated widgets (e.g. multipush→matrix) on open. Widget matching in your Node-RED bridge should key on the literal `address` string (JSON-Pointer-style like `/reactor/power`) plus `preArgs`.

**node-red-contrib-osc.** Maintainer **njh (Nicholas Humfrey) / Nathanaël Lécaudé**, Apache-2.0. Repo `github.com/njh/node-red-contrib-osc` (default branch `main`). **Maintenance:** low-activity/mature — 56 commits total, copyright line reads "2014–2016," and the last substantive change was the v1.0 transport-agnostic rewrite; treat it as **stable but not actively developed**. Latest npm publish: **v1.1.0, 2018-06-23** (npm registry API, verified 2026-07-04); maintainer Nicholas Humfrey. It depends on the `osc` npm package (`require('osc')`, `osc.readPacket`/`osc.writePacket`).

Exact msg shapes (verified from `osc.js` source + `osc.html`):
- **Decode (Buffer → object):** if `msg.payload` is a `Buffer`, the node decodes with `osc.readPacket(payload, {metadata: node.metadata, unpackSingleArgs: true})`, then sets **`msg.topic` = OSC address** and **`msg.payload` = args**. Bundles set `msg.topic = "bundle"` and `msg.payload = raw.packets`.
- **"Include metadata" ON:** each value becomes `{ "type": "f", "value": 33.4 }` (type tag + value). OFF: raw values (single args unpacked).
- **Encode (object → Buffer):** if payload is not a Buffer, the node builds `packet = {address: msg.topic, args: msg.payload}` and outputs `msg.payload = Buffer(osc.writePacket(packet))`. Special cases: `payload === ""` → `{address, args: []}`; `payload === null` → args `{type:"N", value:null}`; bundles pass through with a computed `timeTag` (values > 10,000,000 treated as absolute timestamps). The address must come from `msg.topic` (or the node's configured `path`); if both are empty the node errors: "OSC Path is empty, please provide a path using msg.topic."
- **int vs float casting:** the underlying `osc` library infers type tags from JS types (integers → `i`, floats → `f`) unless you pass explicit `{type, value}` metadata objects. To force a float or int, send args as metadata objects (e.g. `{type:"f", value:1}`) — matching O-S-C's own convention where `send('/address', {type:'i', value:1})` sends an integer.
- **Documented pairing:** the OSC node is **transport-independent** — "you will need to use it with Node-RED's built-in input and output objects like **udp, tcp, websocket or serial**." Standard pattern: **`udp in` → `osc` (decode) → your flow**, and **your flow → `osc` (encode) → `udp out`**. For OSC-over-TCP/serial, add `node-red-contrib-slip` (SLIP decoder before / encoder after the OSC node). This is exactly the UDP-in/UDP-out bridge your architecture needs between tablets/O-S-C and the game server.

---

## Unverified items

Previously-unverified items closed on 2026-07-04 by direct source verification (the client sources are `.mjs`, not `.js` — with correct paths Framagit raw works; npm was checked via the registry JSON API, which is not bot-blocked): widget DOM structure and id attribute (Q3), input event types (Q3), v1.30.3 release date (Q5), npm status of both packages (Q5 — `open-stage-control` turned out not to exist on npm at all).

Still open:

- **Q3:** exact DOM internals of `toggle`/`push`/`xy` widgets (only base class + fader read from source; same base structure applies, per-type inner elements unverified).
- **Q5 session-file `version`/migration field** — no explicit version key found in v1 primary docs/examples; UNVERIFIED whether one exists.

---

## Summary verdict table

| Question                                                                                      | Verdict               | One-line evidence                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1** — custom module can, on session load/client connect, obtain every widget's OSC address | **PARTIAL**           | No exposed session/widget-tree object or event payload with widget data (`callbacks.mjs`), BUT achievable via `sessionSetPath`/`sessionOpened` → `loadJSON(path)`, or `receive('/EDIT/GET', target, 'root', {clientId})` captured in `oscOutFilter` (remote-control docs). |
| **Q2** — one O-S-C instance can serve a different session per client URL                      | **REFUTED (via URL)** | Client-options page lists no `session=`/`load=` query param; `--load` loads one session for "all clients" (server-config page). Per-client sessions are only possible via a custom module calling `/SESSION/OPEN` with `{clientId}`.                                       |