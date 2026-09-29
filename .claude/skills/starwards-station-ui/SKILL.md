---
name: starwards-station-ui
description: Build and modify station screens (weapons, pilot, engineer, etc.) for Starwards - two layout systems (fixed grid vs golden-layout), widget draw patterns, input wiring, color system, JSON Pointer subsystem access, and design constraints for information asymmetry
version: 2025-12-03
related_skills:
  - starwards-pixijs (PixiJS rendering in stations)
  - starwards-colyseus (state sync for ship drivers)
  - arwes-react (lobby UI only, NOT stations)
  - starwards-tdd (test station widgets)
  - starwards-verification (verify build and types)
---

# Skill: starwards-station-ui

Build and modify station screens (weapons, pilot, engineer, etc.) for Starwards.

## Architecture

There are TWO layout systems. Don't mix them.

### Fixed stations (weapons.ts, helms.ts, engineer.ts, signals.ts, dradis.ts)
Use `wrapRootWidgetContainer` + `stationGrid()` (`modules/browser/src/container.ts`).
No golden-layout.

```ts
import { stationGrid, wrapRootWidgetContainer } from '../container';
const container = wrapRootWidgetContainer($('#wrapper'));

await drawRadar(spaceDriver, shipDriver, container); // radar fills the whole container
const grid = stationGrid(container, { left: 262, right: 250 }); // column widths in px
drawMyWidget(grid.left({ scroll: true }), shipDriver);
drawOtherWidget(grid.center({ bottom: true, width: 200 }), shipDriver);
drawMoreWidgets(grid.right(), shipDriver);
```

`stationGrid` overlays three columns (left, center, right) on the root container. Each call to `grid.<column>(options)` returns a widget container stacked top to bottom in that column; slots never overlap. Slot options: `scroll` (the one slot that scrolls when the column is too short), `width` (exact px), `bottom` (push to the column's bottom edge), `fill` (stretch across the column; the default for left/right). Slots appear in request order, independent of draw order.

### Readout skin
Stations share one Tweakpane skin, styled entirely in `static/styles/tweakpane.css`. `setDisplayOnly(displayOnly, station)` in `screens/station-lifecycle.ts` sets `body[data-input]` (`none` for display-only stations; unset for dradis and GM, which keep pointer interaction) and `body[data-station]` (scopes per-station pane ids); `body[data-density='compact']` (set by `templates/sidebar.html`, i.e. gm.html and ship.html) switches to the dense variant. Visual differences between stations are CSS-only: key selectors off these body attributes rather than adding per-station code. Status cells use `data-status` (`OK`/`WARN`/`ERROR`); a value readout that must stay visible when OK carries the `readout` class.

### Customizable screens (gm.ts, ship.ts)  
Use `Dashboard` (golden-layout v1 wrapper). Do NOT touch this for station work.

## Widget patterns

### Draw functions (imperative, non-React)
Most widgets are imperative functions that create Tweakpane or PixiJS elements:

```ts
// Signature pattern
export function drawMyStatus(container: WidgetContainer, shipDriver: ShipDriver): void;
// Or async if it needs awaiting:
export async function drawMyRadar(spaceDriver: SpaceDriver, shipDriver: ShipDriver, container: WidgetContainer): Promise<void>;
```

### Widget factory functions (for golden-layout registration)
Used in gm.ts and ship.ts, NOT in fixed stations:

```ts
export function myWidget(shipDriver: ShipDriver): DashboardWidget { ... }
```

Fixed stations call `drawXxx()` directly. They do NOT use widget factory functions.

## Input wiring

```ts
import { InputManager } from '../input/input-manager';
import { readWriteProp, writeProp, readWriteNumberProp } from '../property-wrappers';

const input = new InputManager();

// Momentary click (fire-once on keydown)
input.addMomentaryClickAction(writeProp(shipDriver, '/chainGun/isFiring'), 'space');

// Toggle (flip boolean on click)
input.addToggleClickAction(readWriteProp(shipDriver, '/chainGun/loadAmmo'), 'r');

// Range (continuous value, keyboard offset)
input.addRangeAction(readWriteNumberProp(shipDriver, '/smartPilot/rotation'), {
    offsetKeys: new KeysRangeConfig('e', 'q', 'e+q,q+e', 0.05),
});

// Gamepad
input.addRangeAction(readWriteNumberProp(shipDriver, '/smartPilot/rotation'), {
    axis: new GamepadAxisConfig(0, 0, [-0.1, 0.1]),
});

input.init(); // must call at end
```

### Existing key bindings (DO NOT CONFLICT)

**Weapons station:** `] [ ' p o i x c v f g b` + `1 2 3 4` (per-tube safety toggle)
**Pilot station:** `q e a d w s r f z` + gamepad axes 0,2,3 + buttons 5,6,7,10,11,14
**Engineer station:** `1-0 a-l` (with shift variants), `] [ \`

## Color system

Import from `../colors`:
- PixiJS hex: `white`, `red`, `blue`, `yellow`, `green`, `selectionColor`
- Radar: `radar.speedLine`, `radar.shellTint`, etc.
- Status: `status.ok`, `status.warn`, `status.error`
- HSL palette: `hsl.primary.main(index)` (0=light, 12=dark), `hsl.secondary`, `hsl.error`
- CSS helpers: `toCss(hexColor)`, `withAlpha(hslColor, alpha)`

Primary = cyan (#00ffff). Secondary = orange (#ff6600). Background = near-black (#0a0a0a).

## ARWES (lobby only)

ARWES components (`arwes-compat.tsx`) are used in the lobby (`index.tsx`/`lobby.tsx`), NOT in station screens. Station screens use Tweakpane for controls and PixiJS for rendering. Don't import ARWES into station code.

## Screen entry point pattern

Every station follows this structure:

```ts
// 1. Parse URL params
const shipUrlParam = urlParams.get('ship');

// 2. Connect driver, wait for ship
const driver = new Driver(window.location).connect();
const statusTracker = new ClientStatus(driver, shipUrlParam);
await driver.waitForShip(shipUrlParam);

// 3. Reload on disconnect
statusTracker.onStatusChange(({ status }) => {
    if (status !== Status.SHIP_FOUND) location.reload();
});

// 4. Get drivers
const shipDriver = await driver.getShipDriver(shipId);
const spaceDriver = await driver.getSpaceDriver();

// 5. Draw widgets into container
const container = wrapRootWidgetContainer($('#wrapper'));
// ... drawXxx calls ...

// 6. Wire input
wireInput(shipDriver);
```

## Ship subsystem pointers

Access ship state via JSON pointer strings:
- `/chainGun/isFiring`, `/chainGun/loadAmmo`, `/chainGun/rateOfFireFactor`
- `/fireTubesCommand` (ship-level: fires every loaded, unlocked tube)
- `/tubes/0/safetyLocked`, `/tubes/0/loadAmmo`, `/tubes/0/changeProjectileCommand`
- `/weaponsTarget/nextTargetCommand`, `/weaponsTarget/clearTargetCommand`
- `/weaponsTarget/shipOnly`, `/weaponsTarget/enemyOnly`, `/weaponsTarget/shortRangeOnly`
- `/smartPilot/rotation`, `/smartPilot/maneuvering/x`, `/smartPilot/maneuvering/y`
- `/warp/levelUpCommand`, `/warp/levelDownCommand`, `/warp/standbyFrequency`
- `/docking/toggleCommand`
- `/afterBurnerCommand`, `/antiDrift`, `/breaks`
- System power/coolant: `/{systemPointer}/power`, `/{systemPointer}/coolantFactor`

## Design constraints

1. **Information asymmetry**: Each station should show ONLY what that role needs. Don't duplicate data across stations.
2. **No HP bars**: Show concrete system states, not abstract health numbers.
3. **Systems filter by relevance**: When showing system status on a station, filter to only relevant systems:
   ```ts
   shipDriver.systems.filter(s => 
       s.pointer.startsWith('/tubes/') || 
       s.pointer === '/chainGun' || 
       s.pointer === '/magazine' || 
       s.pointer === '/radar'
   )
   ```
4. **Template selection**: Fixed stations use `templates/station.html` (full-screen wrapper). Customizable screens use `templates/sidebar.html` (with golden-layout menu).

## Checklist before submitting

- [ ] No golden-layout imports in fixed station code
- [ ] No ARWES imports in station code  
- [ ] No key binding conflicts with other stations
- [ ] `npm run build` passes
- [ ] `npm run test:types` passes
- [ ] All CI jobs pass (no disabling tests or changing CI config)
