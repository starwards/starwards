# Panel Type Specifications

Comprehensive specification of all panel types in Starwards, including data types, hierarchies, semantics, and variations.

**Sibling UI specs:** [Lobby screen](LOBBY_SCREEN_SPECIFICATION.md) · [Visual token integration](VISUAL_TOKEN_INTEGRATION.md)

**Document Version:** 1.0
**Last Updated:** 2025-11-23
**Author:** Design System Documentation

---

## Table of Contents

1. [Tweakpane Control Panels](#tweakpane-control-panels)
2. [PixiJS Canvas Panels](#pixijs-canvas-panels)
3. [React UI Panels](#react-ui-panels)
4. [Lobby/Meta Panels](#lobbymeta-panels)
5. [Cross-Cutting Properties](#cross-cutting-properties)

---

## Tweakpane Control Panels

Interactive UI control panels using Tweakpane library.

### 1. Properties

**Type:** Generic property inspector
**Data Types:** Mixed numeric, text, enum
**File:** `modules/browser/src/panel/property-panel.ts`

**Hierarchy:**
- Flat or single-level folders (e.g., "chainGun")

**Variations:**
- **Helm Properties:** energy, speed, heading, rotation, smart pilot modes
- **Gun Properties:** ammo counts, loading status, fire state
- **Design State Properties:** system configuration parameters

**Data Examples:**
```typescript
- Numbers: energy (float), speed (float), heading (0-360°)
- Text: rotation mode (enum as string), targeted ID
- Ranges: rotation command [-1,1], afterBurner [0,1]
```

**Usage Contexts:**
- `pilot.ts` → Helm controls
- `gun.ts` → Weapon controls
- `design-state.ts` → Configuration editor

---

### 2. Engineering Status

**Title:** "Engineering Status"
**Data Types:** Boolean (formatted), float32 graphs
**File:** `modules/browser/src/widgets/enginering-status.ts`

**Hierarchy:** Flat list

**Fields:**
| Field               | Type    | Format            | Description           |
| ------------------- | ------- | ----------------- | --------------------- |
| `control`           | Boolean | "ECR" \| "Bridge" | Control location      |
| `hull`              | Boolean | "DAMAGED" \| "OK" | Hull damage indicator |
| `energy`            | float32 | Graph             | Reactor energy level  |
| `after-burner fuel` | float32 | Graph             | Maneuvering fuel      |

**Semantics:** Ship resource monitoring for engineering crew

---

### 3. Tubes Status

**Title:** "Tubes Status"
**Data Types:** String, float32 slider, boolean
**File:** `modules/browser/src/widgets/tubes-status.ts`

**Hierarchy:** Folder per tube (dynamic)

**Per-Tube Fields:**
| Field         | Type       | Editable | Description              |
| ------------- | ---------- | -------- | ------------------------ |
| `ammo to use` | String     | ❌        | Selected projectile type |
| `ammo loaded` | String     | ❌        | Currently loaded ammo    |
| `loading`     | Slider 0-1 | ❌        | Loading progress         |
| `auto load`   | Boolean    | ✅        | Auto-load toggle         |

**Variations:** Number of tubes varies by ship class

---

### 4. Full Systems Status

**Title:** "Full Systems Status"
**Width:** 600px fixed
**File:** `modules/browser/src/widgets/full-system-status.ts`

**Hierarchy:** Table with headers + system rows + defectibles rows

**Table Structure:**

**Header Row:**
```
Status | Power | EPM | Heat | Coolant | Hacked
```

**System Row (per system):**
| Column  | Type   | Format                          | Color Coding   |
| ------- | ------ | ------------------------------- | -------------- |
| Status  | Enum   | "OK" \| "DAMAGED" \| "DISABLED" | ✅ Status-based |
| Power   | Enum   | PowerLevel (0/0.25/0.5/0.75/1)  | -              |
| EPM     | int    | Rounded energy/min              | -              |
| Heat    | int    | Rounded temperature (0-~400)    | -              |
| Coolant | Slider | 0-100% editable                 | -              |
| Hacked  | Enum   | HackLevel (0/0.5/1)             | -              |

**Defectibles Row:**
- Variable width cells (80px each)
- Shows subsystem health sliders
- Dynamic count based on system

**Theme Integration:**
```typescript
statusCell.element.classList.add('tp-rotv');
statusCell.element.dataset.status = system.getStatus();
// CSS: :root [data-status='OK'] { --tp-base-background-color: hsl(123, 61%, 18%); }
```

---

### 5. Systems Status (Compact)

**Title:** "Systems Status"
**Width:** 370px fixed
**File:** `modules/browser/src/widgets/system-status.ts`

**Hierarchy:** Table with 4 columns

**Table Structure:**
```
Status | Power | Heat | Hacked
```

**Differences from Full:**
- No EPM column
- No coolant control
- No defectibles row
- All cells are status-colored text ("OK"/"WARN"/"ERROR")

**Cell Width:** 50px each

---

### 6. Create Objects

**Title:** "Create Objects"
**Data Types:** Numbers, enums, booleans, buttons
**File:** `modules/browser/src/widgets/create.ts`

**Hierarchy:** 4 folders (expanded by default)

**Folder Contents:**

**Asteroid:**
- `radius`: Slider (1 to Asteroid.maxSize)
- Create button

**Ship:**
- `faction`: Dropdown (Faction enum)
- `shipModel`: Dropdown (ship models array)
- `isPlayerShip`: Boolean toggle
- Create button

**Explosion:**
- `damageFactor`: Slider (1-1000)
- Create button

**Waypoint:**
- Create button only

**Semantics:** GM object spawning interface

---

### 7. GM Controls

**Title:** "GM Controls"
**File:** `modules/browser/src/widgets/gm.ts`

**Hierarchy:** Single control

**Field:**
- `type`: TypeFilter enum list (ALL, OBJECTS, WAYPOINTS)

**Semantics:** Radar view filter for GM

---

### 8. Docking

**Title:** "Docking"
**File:** `modules/browser/src/widgets/docking.ts`

**Hierarchy:** Flat

**Fields:**
| Field            | Type   | Update Frequency | Description           |
| ---------------- | ------ | ---------------- | --------------------- |
| `Current Target` | String | On change        | Ship ID               |
| `Mode`           | Enum   | On change        | DockingMode list      |
| `Closest Option` | String | 250ms loop       | Computed closest dock |

**Semantics:** Ship docking interface

---

### 9. Targeting

**Title:** "Targeting"
**File:** `modules/browser/src/widgets/targeting.ts`

**Hierarchy:** Flat

**Fields:**
- `target`: String (target ID)
- `Ship Only`: Boolean
- `Enemy Only`: Boolean
- `Short Range`: Boolean

**Semantics:** Weapons targeting filters

---

### 10. Warp

**Title:** "Warp"
**File:** `modules/browser/src/widgets/warp.ts`

**Hierarchy:** Flat

**Fields:**
| Field            | Type   | Format              | Status Styled    |
| ---------------- | ------ | ------------------- | ---------------- |
| `Actual LVL`     | Slider | Current warp level  | -                |
| `Designated LVL` | Slider | Target warp level   | -                |
| `Proximity Jam`  | Text   | "JAMMED" \| "CLEAR" | ✅ WARN if jammed |
| `Actual FRQ`     | Text   | WarpFrequency enum  | -                |
| `Designated FRQ` | Text   | WarpFrequency enum  | -                |
| `Calibration`    | Slider | Frequency change    | -                |

**Status Styling:**
```typescript
jamBlade.element.classList.add('status', 'tp-rotv');
jamBlade.element.dataset.status = shipDriver.state.warp.jammed ? 'WARN' : '';
```

---

### 11. Ammunition

**Title:** "Ammunition"
**File:** `modules/browser/src/widgets/ammo.ts`

**Hierarchy:** Flat list (per projectile type)

**Per-Projectile:**
- Label: Projectile name
- Value: `${count} / ${max}` (computed)

**Variations:** Iterates `ammoTypes` array

**Semantics:** Magazine inventory display

---

### 12. Tweaks (GM Panel)

**Title:** "Tweaks"
**Data Types:** All types (number, boolean, string, enum, cameraring)
**File:** `modules/browser/src/widgets/tweak.ts`

**Hierarchy:** Deep nested folders

**Structure:**
```
- Selection type filter
- Per-object folders:
  - ID (readonly)
  - Tweakables (discovered via metadata)
  - Scan Levels (per-faction dropdown)
  - For ships:
    - Armor folder
    - System folders (per system)
      - Defectibles (sliders)
      - System tweakables
      - Design folder
    - Ship design folder
```

**Special Controls:**
- `cameraring`: Circular numeric input for angles
- Scan levels: Per-faction dropdown (UFO/BASIC/ADVANCED)

**Discovery Method:**
```typescript
for (const tweakable of getTweakables(state)) {
  // Reflect metadata to find @tweakable decorated fields
}
```

**Semantics:** Debug/design parameter inspector for GM

---

## PixiJS Canvas Panels

Visual displays rendered using PixiJS graphics engine.

### 13. Tactical Radar

**data-id:** "Tactical Radar"
**File:** `modules/browser/src/widgets/tactical-radar.ts`
**Props:** `{ range: number }` (default: 5000)

**Rendering:** PixiJS Graphics + Sprites

**Layers (back to front):**
1. Fog of war (gray `0x1a1a1a`)
2. Field of view fill (visible areas `0x0a0a0a`)
3. Movement anchor grid (1000px spacing, `0xaaffaa`)
4. Range indicators (range/5 spacing)
5. Azimuth circle (heading reference)
6. Speed lines (movement vector)
7. Crosshairs (ship center)
8. Blips (tactical symbols, green `0x34d534`)

**Visual Features:**
- Circular mask (85% of square size)
- FoV shows sensor range
- Range rings for distance reference

**Semantics:** Combat-focused radar with range rings

---

### 14. Pilot Radar

**data-id:** "Pilot Radar"
**File:** `modules/browser/src/widgets/pilot-radar.ts`
**Props:** `{ range: number }` (default: 5000)

**Dynamic Behavior:**
```typescript
const isWarp = warpLevel > 0.5;
const range = isWarp ? 100_000 : 5_000;
```

**Layers:**
- Dual masks (overall + content)
- FoV graphics
- Movement anchor layer
- Range indicators
- Azimuth circle
- Target indicators (crosshairs + range circle)
- Blips + waypoints
- Speed lines

**Special Features:**
- Target tracking visualization
- Bearing/distance text labels
- Adaptive range based on warp state

**Semantics:** Navigation-focused with warp mode

---

### 15. GM Radar

**data-id:** "GM Radar"
**File:** `modules/browser/src/widgets/gm.ts`
**Props:** `{ zoom: number }`

**Layers:**
- Grid
- Interactive layer (click, drag, create)
- Per-faction FoV overlays (alpha 0.1)
- Blips (color by faction)
- Waypoints

**Faction Colors:**
| Faction     | Color  | Hex        |
| ----------- | ------ | ---------- |
| NONE        | Yellow | `0xe2b640` |
| Gravitas    | Red    | `0xd53434` |
| Raiders     | Blue   | `0x404fc9` |
| Projectiles | White  | `0xffffff` |

**Interaction:** Selection, object creation via InteractiveLayer

**Semantics:** God-mode space view with editing

---

### 16. Target Radar

**File:** `modules/browser/src/widgets/target-radar.ts`
**Props:** `{ range: number }`

**Behavior:**
- Camera follows selected target
- Fixed range display
- FoV-filtered

**Layers:**
- Crosshairs
- Speed lines
- Range indicators
- Blips

**Semantics:** Zoomed view of selected target

---

### 17. Radar (Basic Ship)

**File:** `modules/browser/src/widgets/radar.ts`
**Props:** `{ zoom: number }`

**Layers:**
- Radar range layer (sensor coverage)
- Grid
- Blips (DRADIS-style symbols)

**Blip Colors:**
- Blue (`0x404fc9`): Friendly
- Red (`0xd53434`): Enemy
- Yellow (`0xe2b640`): Neutral

**Filtering:** Radar range filter (faction-based)

**Camera:** Follows own ship

**Semantics:** Standard sensor view

---

### 18. Armor

**data-id:** "Armor"
**File:** `modules/browser/src/widgets/armor.ts`

**Rendering:** PixiJS Sprites + Graphics masks

**Visual Design:**
- SVG ship texture (`dragonfly-armor.svg`)
- Circular plate segments
- Dynamic plate count (from `armor.numberOfPlates`)
- 3° margin between plates (`plateMarginRadians`)

**Color Coding:**
```typescript
sprite.tint = rgb2hex([1-health, health, 0]);
// Green = healthy, Red = damaged, Yellow = mid
```

**Data Fields:**
- Per-plate health (0 to `plateMaxHealth`)
- Total plates count
- Degrees per plate

**Size:** Square, responsive to container

**Semantics:** Ship armor plate visualization

---

## React UI Panels

HTML/React components with Arwes theming.

### 19. Monitor

**File:** `modules/browser/src/widgets/monitor.tsx`
**Framework:** React + Arwes theme

**Data Types:** Numeric (rounded), text (enum)

**Fields:**
- **Energy:** Metric (4-digit zero-padded)
- **Afterburner:** Metric (4-digit zero-padded)
- **Per-system status:** `${name} : ${status}`

**Theme:**
- Sci-fi aesthetic
- Font: Electrolize
- Component: Arwes Blockquote

**Audio:** Bleeps on interactions

**Semantics:** Ship vitals dashboard

---

### 20. Damage Report

**File:** `modules/browser/src/widgets/damage-report.tsx`
**Framework:** React + Arwes + XState

**Data Types:** Text, defectible states

**Behavior:**
- Auto-appears when system damaged
- Auto-disappears after 1s exit animation
- Sorted by alert time

**Display Format:**
```
--------------------------
<System Name> : <Status>
```

**State Machine:**
```
hide ↔ show ↔ exiting (XState)
```

**Timings:**
- Enter: 2000ms
- Exit: 1000ms

**Semantics:** Damage alert feed

---

## Lobby/Meta Panels

HTML components for game lobby.

### 21-25. Lobby Screen Elements

**File:** `modules/browser/src/components/lobby.tsx`

**Elements:**
| data-id     | Element | Action             |
| ----------- | ------- | ------------------ |
| "stop game" | Button  | Stops current game |
| "save game" | Button  | Saves game state   |
| "new game"  | Button  | Starts 2v1 game    |
| "title"     | Header  | "Starwards" text   |
| (dynamic)   | Cards   | Per-ship selection |

**Framework:** React + Arwes

---

## Cross-Cutting Properties

### Data Type Patterns

| Type         | Usage                   | Example Fields                             |
| ------------ | ----------------------- | ------------------------------------------ |
| **float32**  | Most numeric game state | energy, speed, heat                        |
| **int8**     | Enums                   | IdleStrategy, Order, PowerLevel, HackLevel |
| **boolean**  | Toggles                 | ecrControl, isPlayerShip, auto-load        |
| **string**   | IDs, names              | targetId, shipId, currentTask              |
| **Computed** | Aggregated values       | ammo format, status calculations           |

### Semantic Categories

1. **Resource Monitoring:** Engineering Status, Monitor
2. **System Diagnostics:** Systems Status, Full Systems Status
3. **Combat Systems:** Tubes, Targeting, Ammunition
4. **Navigation:** All Radars, Warp, Docking
5. **Ship Integrity:** Armor, Damage Report
6. **Development/GM:** Create, GM Controls, Tweaks, Properties

### Styling Systems

**Status Colors (via `data-status` attribute):**
- "OK" → Green (`hsl(123, 61%, 18%)`)
- "WARN" → Yellow (`hsl(52, 61%, 18%)`)
- "ERROR" → Red (`hsl(0, 69%, 17%)`)

**Themes:**
- **Tweakpane:** Panels 1-12 (CSS variables)
- **PixiJS:** Panels 13-18 (hex colors)
- **Arwes:** Panels 19-20 (React components)

**Fonts:**
- **Bebas:** Radars, labels
- **Electrolize:** React panels
- **Titillium Web:** Arwes components
- **Roboto Mono:** Tweakpane

---

## Implementation References

### Key Files

**Tweakpane Panels:**
- `modules/browser/src/panel/property-panel.ts`
- `modules/browser/src/panel/blades.ts`
- `modules/browser/src/widgets/*.ts`

**PixiJS Panels:**
- `modules/browser/src/widgets/*-radar.ts`
- `modules/browser/src/widgets/armor.ts`

**React Panels:**
- `modules/browser/src/widgets/monitor.tsx`
- `modules/browser/src/widgets/damage-report.tsx`
- `modules/browser/src/components/lobby.tsx`

**Styling:**
- `/static/styles/tweakpane.css`
- `/static/styles/index.css`
- `modules/browser/src/colors.ts`
- `modules/browser/src/components/arwes-compat.tsx`

---

## Change History

| Version | Date       | Changes                             |
| ------- | ---------- | ----------------------------------- |
| 1.0     | 2025-11-23 | Initial comprehensive specification |
