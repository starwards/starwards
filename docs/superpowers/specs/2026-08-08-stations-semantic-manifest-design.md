# Stations semantic manifest — design

Define every station percept (widget) and affordance (command/input) **once**, in `modules/core`,
as semantics rather than renderings — so the browser, the MCP server, and any future medium
(OSC tablets, hardware panels, voice relay) are interpreters of one declaration instead of
mirrors of each other.

## Coined terms

**Percept** and **Affordance** are the project's canonical terms for these concepts — in code
identifiers, the served manifest, MCP tool surfaces, and docs. "Widget" and "command" are the
legacy names they replace (widget survives only inside browser skin code, where it names a
rendering, not a semantic).

- **Percept** — a unit of information a station perceives. Legacy: widget.
- **Affordance** — a unit of action a station is offered. Legacy: command / input action / hotkey.
- **Skin** — one medium's rendering of a percept. Skins are per-surface and may be bespoke;
  semantics are never per-surface.
- **Facet** — a subsystem-oriented cluster of percept fields + affordances declared once in core
  (`warp`, `docking`, `repair-queue`, …). Widgets are named arrangements of facets;
  the server manifest grants percepts/affordances to stations at registry-id granularity.

## Layer 1 — intrinsic semantics: state annotations

What a field *is*, independent of any view, is declared on the state class next to the physics
that produce it — extending the existing decorator family (`@gameField`, `@range`, `@defectible`).
`@tweakable` is untouched: it means "appears in the GM tweak panel" and nothing else.

### Field kinds

| Kind | Nature | Declared by |
|---|---|---|
| `gauge` | continuous bounded quantity | `@gauge({ unit? })` — range comes from existing `@range` |
| `stock` | discrete resource count against a capacity | `@stock({ capacity })` — capacity is a sibling/design field ref |
| `progress` | transient 0→1 with completion semantics | `@progress()` |
| `mode` | discrete operating state; **trait `order`** marks a progression with an OFF/zero state | `@mode({ enum, order?, off?, severity? })` |
| `condition` | discrete diagnosis (happens *to* you rather than chosen); severity map for attention coding | `@condition({ states, severity })` |
| `setpoint` | commanded twin of an actual field (+ optional transition progress); deviation is the meaning | `@setpoint({ actual, transition? })` on the commanded field — refs are `keyof` the class, compiler-checked |
| `reference` | pointer to another entity; resolution goes through core perception (scan-gated naming is automatic, in one place) | `@entityRef({ type? })` |
| `notice` | transient operator-directed message | `@notice()` |

Notes:

- There is **no `derived` kind** — how a value is computed is a *source*, not a semantic
  (see Layer 2). A distance is a `gauge` whether it comes from a pointer or a computation.
- Ordered modes (`PowerLevel`, warp level) support step affordances, segment-bar skins, and
  severity-by-distance-from-nominal color coding. Unordered modes (`WarpFrequency`) are
  alternatives, not progressions.
- Inference keeps annotation noise low: a numeric `@gameField` with `@range` defaults to `gauge`;
  an enum field defaults to unordered `mode`. Explicit decorators override or enrich.
- Severity vocabulary is `ok | warn | error`, matching the existing CSS contract
  (`dataset.status`), replacing today's three divergent spellings.
- Units are semantic (`bearing`, `distance`, `seconds`, `ratio`), never format closures.
  Each medium interprets: browser renders `142.5°` / `3km`; a voice relay says
  "bearing one-four-two". Enum display names come from the enum itself.

### Affordance kinds

Declared with `@affordance({ kind, label, ... })` — on the command field it writes
(pulse/hold/toggle fields), or on the data field it acts on (step/axis/set).
`label`/`description` live in the annotation config (JSDoc does not survive to runtime);
MCP `get_capabilities` and hotkey-help both generate from them.

| Kind | Nature | Examples (of the 40) |
|---|---|---|
| `pulse` | momentary trigger | `resetRotationOffset`, `changeFrequency`, `fireTube` |
| `hold` | engaged while held (0/1 or ranged) | `afterBurner`, `antiDrift`, `breaks`, `fireChainGun` |
| `toggle` | flips a boolean | `dock`, `ecrControl`, `targetShipsOnly/EnemyOnly/ShortRangeOnly`, `pauseJobs`, `loadTube`, `loadChainGun` |
| `step` | ±increment over a setpoint / ordered mode / enum | `warpUp`+`warpDown` (bound to up/down pulse fields on the `desiredLevel` setpoint), `systemPower`, `systemCoolant`, `warpFrequency`, `changeTubeAmmo`, `changeGunAmmo` |
| `axis` | continuous input over a range | `rotation`, `strafe`, `boost`, `beamDirection`, `beamArc` |
| `set` | direct value write / mode select | `rotationMode`, `maneuveringMode`, docking mode select, tube cluster-warhead select |
| `select` | entity selection (server-side cycling or client-local) | `nextTarget`/`prevTarget`/`clearTarget`; signals' client-local scan cycling |
| `invoke` | argumented command, possibly catalog- or collection-scoped | `enqueueRepair(protocolId)`, `cancelRepair(opId)`, `reorderRepair(opId, dir)`, `prioritizeJob(jobId)`, `cancelJob`, `placeWaypoint(pos)`, `editWaypoint`, `moveWaypoint`, `deleteWaypoint` |

### Feedback

Every affordance has a feedback surface — the percept(s) that normally change as a direct
result of exercising it. The relation is **derived by default** (affordances are declared on
the field they act on, so the loop closes itself) and declared only where derivation cannot
reach. Four shapes:

| Shape | What changes | How it is known |
|---|---|---|
| `echo` | the written field itself (`toggle` → its boolean, `set`/`axis` → the field) | derived from the affordance's target |
| `response` | the actual (and transition) twins of a setpoint — command → track → settle | derived from `@setpoint` linkage: `warpUp` echoes on `desiredLevel`, responds on `currentLevel` via `frequencyChange`-style transitions |
| `membership` | a collection gains or loses a member | defaults to the collection an `invoke` is scoped to (`enqueueRepair` → operations, `placeWaypoint` → waypoints, `deleteWaypoint` → removal) |
| `refusal` | a `notice` field carries the rejection | the only declared shape: `@affordance({ ..., refusal })` names the notice (`enqueueRepair` → `/repairQueue/refusalReason`) |

Each medium interprets the same relation its own way: the browser co-locates a control with
its feedback and may flash it on actuation; MCP's `execute_command` returns the feedback
percept's fresh value in the tool result (closing the loop for the LLM instead of a bare
ack); a voice relay reads back the echo; a hardware panel places the LED next to the button.

Creation commands are not a separate kind: `placeWaypoint` is an `invoke` with a
semantically-typed `position` argument (supplied by radar interaction in the browser,
absolute coordinates over MCP) whose feedback shape is membership-add.

- Affordances on collections (per-tube fire, per-system power) are declared once on the item
  class; the instance is addressed by the collection index/pointer at dispatch.
- **Local affordances** (camera pan/zoom/follow, layer toggles, client-side cycling, waypoint
  placement-settings) act on view state only. They are declared in facet specs (not state
  annotations — there is no state field), carry no manifest flag, and are invisible to MCP —
  exactly the boundary `stations-manifest.ts` already documents.
- Hotkey/gamepad *assignments* stay browser-side config keyed by affordance id
  (which key is presentation; that it is steppable is semantics). `input-config.ts` shrinks
  to a keymap.

## Layer 2 — composition: facet specs in core

A facet spec selects and arranges annotated fields into percepts. Entries are mostly bare
pointers because semantics ride the state. Spec-level constructs:

- **Source** (orthogonal to kind): a state pointer, a **named core derivation**
  (`systemStatus`, `heatStatus`, `distanceTo`, `bearingTo`, `closestDockingTarget`,
  `objectDisplayName`), or client context (current selection). Derivations are typed as
  returning one of the field kinds. This replaces the rejected `derived` kind and pulls the
  target-info / docking poll-loops' logic into core.
- **Collection**: items over an ArraySchema/MapSchema/systems selector with traits
  `filter` (in-progress job only), `groupBy` (ammo Shells/Missiles, empty groups dropped),
  `orderBy` (damage report by `alertTime`), `presence` (warp facet only when fitted,
  cluster-warhead only when design enables), nesting (defectibles under a system row).
- **View traits**: `trend` (history is meaningful → browser graphs it, a relay reports the
  delta) — view-level because engineering graphs energy while monitor shows a padded number.
- **Dynamic titles** as label sources (protocol-name lookup, pluralized selection) — a label is
  a field like any other.

### Identity — two address spaces and a join table

- **Fields** are addressed by the existing JSON-pointer scheme (`docs/json-ptr.md`), as
  pointer *templates* over collections (`/tubes/{index}/loading`). Annotations are keyed by
  (schema class, property) and resolve to templates — no new field addressing is invented.
- **Percepts and affordances** are addressed by dot-separated, facet-first ids:
  `warp.status`, `systems.full`, `radar.tactical`; `warp.up`, `tubes.fire`,
  `repair.enqueue`. The facet segment normally mirrors the state path segment
  (`warp` ↔ `/warp`), so the two address spaces rhyme, and facet grouping is readable from
  the id itself. Today's flat names (`warp-status`, `warpUp`) migrate per facet stage.
- **The registries join the two**: id → structural refs (pointer templates via
  compiler-checked class-property refs, arg schemas, refusal notices). Correlation is then
  uniform:
  - TS consumers (skin registry, keymap, gallery scenes, `data-id` selectors, MCP zod
    enums) are typed against `keyof typeof perceptRegistry` / `affordanceRegistry` — a
    stale id is a build error.
  - Data boundaries (manifest grants, layout annex) are JSON, runtime-validated against
    the same keys at server startup and by unit test.
  - The dispatch wire format is `{ affordance id, item address (collection index/key when
    scoped), args }` — identical for a browser keypress and an MCP `execute_command`,
    making the two surfaces provably the same control path.

### Registries and enforcement

- `perceptRegistry: Record<StationPercept, PerceptSpec | RadarViewRef>` — exhaustive, in core.
  `stationPercepts` (today's `stationWidgets`) is derived from its keys: **one place**.
- `affordanceRegistry: Record<StationAffordance, AffordanceRef>` — exhaustive, in core
  (today's `stationCommands`). Refs point at annotated fields; a typo is a compile error.
- The server manifest (grants per station) is validated against the registries at startup and
  by a unit test. Core defines *what exists*; the server manifest only says *who gets which*.

## Station composition — grants, grouping, placement

Three concerns that must not share one mechanism:

1. **Grants** — `StationEntry.percepts` / `.affordances` stay **flat sets** of registry ids.
   The manifest is a deny-by-default sandbox boundary; authorization carries no ordering or
   nesting meaning. Validated ⊆ registries.
2. **Semantic hierarchy** — free, from facets: facet → percepts → fields/collections, and
   every affordance belongs to a facet. Defined once in core, never per station. Every medium
   may organize by it: MCP groups `get_capabilities` by facet, a voice relay enumerates
   readouts by facet, OSC gets a page per facet. A station granted warp percepts inherits
   warp's internal structure.
3. **Placement** — an optional `layout` annex on `StationEntry`: a region tree
   (splits/tabs/stacks) whose leaves are granted percept ids. Presentation data, outside the
   vocabulary: visual media read it, MCP ignores it, validation asserts leaves ⊆ grants.
   Absent a layout, the browser auto-layouts from defaults the design already carries —
   radar preference order picks the main view, facet grouping clusters side panels, percept
   kind suggests sizing. For ship.html the annex is the initial arrangement; user
   rearrangement persists client-side as today. Consequence: a bridge is fully configurable
   server-side — a GM re-seats a bridge without code.

What "hints" the browser is therefore two-level: **what** to render = percept kind →
default renderer (gauge → bar, ordered mode → segment bar, collection → table/folders),
overridden per percept id by the skin registry; **where** = the layout annex, or
auto-layout when absent.

## Interpreters (one per medium, written once)

| Medium | Reads | Writes |
|---|---|---|
| Browser | generic Tweakpane renderer walks a percept spec; **skin registry** may override whole percepts (armor ring, damage-report fade, monitor-as-alternate-skin). Overrides are presentation only — the spec stays canonical | generic input wiring from granted affordances + keymap; per-screen `wireInput` functions dissolve |
| MCP | generic serializer (replaces `readers.ts`); `get_capabilities` generated from affordance annotations (replaces `command-map.ts`) | generic `execute_command` dispatch through the affordance registry |
| OSC / hardware / voice (future) | layout/readout generation from the same spec | same dispatch |

Rendering mechanics — re-render signatures, XState fades, `<datalist>` injection, `data-id`
E2E attributes — are interpreter/skin internals, never vocabulary.

## Radar percepts

The four radar percepts keep bespoke PixiJS rendering; their *semantics* are a named
**radar view config** in core: range source, visibility filter (`FieldOfView` /
`RadarRangeFilter`), layer set. Browser renders it; MCP `get_radar_contacts` consumes the
same config by id — extending the parity already enforced by `radar-view.spec.ts`.
Radar-attached affordances: `select` (blip selection), `invoke` (waypoint place/move on
relay-radar), plus local pan/zoom/follow.

## Complete coverage — percepts

All 21 manifest percepts plus the ship.html-only registrations. "Spec" = expressible in
Layer 1+2 with the generic renderer; "Skin" = spec + bespoke browser skin.

| Percept (legacy widget id) | Treatment | Mapping |
|---|---|---|
| `pilot-stats` | Spec | gauges (energy, fuel, speed, turnSpeed), setpoints (rotation, strafe/boost via smartPilot), modes (rotation/maneuvering), toggles' state (afterBurner, antiDrift, breaks) |
| `systems-status` | Spec | collection over systems; condition (status via `systemStatus` derivation), ordered mode + severity (PowerLevel), condition (heat via `heatStatus`, HackLevel) |
| `full-systems-status` | Spec | same collection + gauges (EPM, heat, coolant), nested defectible gauges |
| `engineering-status` | Spec | mode (ecrControl authority ECR/Bridge), condition (hullDamaged), gauges with `trend` (energy, afterburner fuel) |
| `warp-status` | Spec | setpoint (level + frequency, each with transition), condition (jammed) |
| `docking-status` | Spec | reference (target), ordered mode (docking phases), reference from `closestDockingTarget` derivation |
| `armor-status` | Skin | collection of plate-health gauges; PixiJS wedge-ring skin (continuous severity tint) |
| `damage-report` | Skin | collection of conditions from `@defectible`, `orderBy: alertTime`, broken-systems filter; React fade skin |
| `repair-queue` | Spec | notice (refusalReason — declared refusal feedback of enqueue), catalog collection (available protocols, presence-filtered) with `invoke` enqueue (membership feedback on ops), ops collection: condition (status), progress, `invoke` cancel/reorder (reorder presence-gated on QUEUED) |
| `tubes-status` | Spec | collection of tubes: setpoint (projectile/loadedProjectile + loading transition), toggle (loadAmmo), set (clusterWarhead, presence-gated on design) |
| `ammo-status` | Spec | grouped collection of stocks (count/capacity from design) |
| `targeting-status` | Spec | reference (weaponsTarget), toggles' state (three filters) |
| `gun-status` | Spec | per-gun collection, same shapes as tubes; legacy `gunWidget` PropertyPanel is retired by the migration |
| `target-info` | Spec | reference-resolved fields (type/faction, scan-gated by construction), gauges via `distanceTo`/`bearingTo` derivations with `distance`/`bearing` units |
| `signals-jobs` | Spec | toggle (jobsPaused), filtered collection (in-progress job): condition (JobStatus), progress, scan-gated label source, `invoke` prioritize/cancel |
| `waypoint-groups` | Spec | grouped collection over own waypoints; set (name/color fan-out writes), local focus (centroid), `invoke` bulk delete |
| `waypoint-edit` | Spec | selection-sourced collection; set (title, group, color), set (x/y — dispatched as `moveWaypoint` deltas), `invoke` delete, local focus; empty-selection presence |
| `pilot-radar`, `tactical-radar`, `long-range-radar`, `relay-radar` | Radar view config | see Radar percepts |
| ship.html `monitor` | Skin | alternate skin over engineering-status + systems-status percepts — no vocabulary of its own |
| ship.html `target radar`, `radar` | Radar view config | join the radar config registry (named views; manifest exposure optional) |
| ship.html `helm` | Spec | same percept as `pilot-stats`; legacy PropertyPanel retired |
| ship.html `design state` | **Exempt** | GM/debug reflection tool (`getTweakables`, `DesignState.keys()`) — already has its own single-source mechanism |
| GM screens (tweak, create, gm radar pane) | **Exempt** | editors, not station percepts; explicitly out of scope |

## Complete coverage — affordances

All 40 affordances (today's `stationCommands`) map to the eight kinds (table in Layer 1 lists each by name).
Browser-side input actions not in the manifest — pan/zoom/follow, layer toggles, client-local
scan-target cycling, waypoint placement settings — are **local affordances** in facet specs.
The ecr screen's authority gate (whole InputManager enabled by `/ecrControl`) becomes a
declared **grant condition** on the ecr facet's affordances (`activeWhen: ecrControl`),
interpreted by browser wiring and MCP `checkEcrControl` alike — one declaration replaces
today's duplicated arbitration.

## What this deletes

- `mcp/src/sandbox/command-map.ts` (pointer bindings ← affordance annotations)
- `mcp/src/readers.ts` (hand-written readers ← generic serializer)
- per-screen `wireInput` bodies and `input/wiring.ts` duplication (← generic wiring + keymap)
- `screens/station-system-filters.ts` duplication with `readers.ts` (← one facet filter)
- ECR arbitration duplication (`ecr.ts` vs `session.ts`)
- hand-maintained `stationWidgets`/`stationCommands` arrays (← registry keys)
- the words "widget" and "command" as semantic names — `StationPercept`/`StationAffordance`
  types, `percepts`/`affordances` fields on `StationEntry`, and MCP tool parameters
  (`get_ship_status`, `execute_command`) all adopt the coined terms; per the no-tombstones
  rule, old names are deleted everywhere, not aliased
- the three severity-coloring spellings (← one severity map contract)

## Migration plan (staged vertical slices, each shippable)

1. **Annotation infrastructure + warp slice**: decorators, percept/affordance registries,
   browser generic renderer + wiring, MCP generic reader/dispatch — for the warp facet only.
   Both surfaces switch `warp-status`, `warpUp/Down`, `warpFrequency`, `changeFrequency`.
   Parity test asserts MCP output against the spec like `radar-view.spec.ts` does for radar.
2. **Simple panels**: docking, engineering-status, targeting, ammo, tubes, gun (+ retire
   legacy PropertyPanel widgets).
3. **System tables**: systems-status, full-systems-status, monitor-as-skin; severity unification.
4. **Pilot + ECR affordances**: axis/hold/step wiring interpreter, keymap extraction,
   ecr grant condition.
5. **Argumented invokes**: repair-queue, signals-jobs.
6. **Relay/waypoints**: collections over space state, fan-out writes, local affordances.
7. **Radar view configs**: four manifest radars + ship.html radars into the config registry.
8. **Deletions + terminology**: remove readers/command-map/wireInput bodies, derive
   `stationPercepts`/`stationAffordances` from registries, rename manifest fields and MCP
   tool parameters to the coined terms, manifest validation test, docs update
   (INTEGRATION.md, ARCHITECTURE.md, TECHNICAL_REFERENCE.md, standards-naming.md gains
   Percept/Affordance definitions).

Each stage: full vertical slice (state → server → both clients → tests → snapshots), no
leftover tasks. Visual snapshots rebaseline once per stage that touches rendering.

## Testing

- Registry exhaustiveness is compile-time (exhaustive `Record`s).
- Spec↔surface parity: for each percept, a jest test renders the MCP serialization from a
  `ShipTestHarness` state and asserts fields against the spec; gallery visual tests cover
  browser skins as today.
- Manifest validation: server grants ⊆ registries.
- Affordance dispatch: existing `server.spec.ts`/`testplay.spec.ts` generalize to iterate
  the registry instead of hand-picked commands.

## Open risks

- **Decorator metadata plumbing**: annotations must be readable at runtime in browser and MCP
  (same mechanism as `getTweakables`/`getRange` — proven, but the new decorators must respect
  the decorator-order constraint documented in CLAUDE.md).
- **Expressiveness creep**: waypoint editors and repair-queue push the spec hardest
  (fan-out writes, catalog invokes, presence-gated buttons). The escape hatch is a bespoke
  skin over a canonical spec — never a per-surface semantic.
- **ship.html/manifest vocabulary merge** may surface naming decisions (e.g. does `monitor`
  become a grantable percept or stay a skin?) — decided per-case during stage 3.
- **Rename blast radius**: the manifest is consumed only by MCP today, so renaming its fields
  is cheap now and expensive later — stage 8 is the deadline, earlier is fine.
