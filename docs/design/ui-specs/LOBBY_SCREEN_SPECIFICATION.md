# Starwards Lobby Screen Design Specification

**Target Audience:** Professional UI/UX Designers
**Project:** Starwards - Multiplayer Space Combat LARP System

---

## 1. Project Context

### 1.1 What is Starwards?

Starwards is a multiplayer space combat simulation designed for Live Action Role Play (LARP) events. It's a serious, hard sci-fi system where 4-20 players crew multiple spacecraft in real-time combat scenarios. Each player operates a dedicated station (Pilot, Weapons, Engineering, etc.) with their own screen showing relevant tactical data.

**Key Characteristics:**
- Hard science fiction aesthetic (not Star Wars fantasy)
- Technical, data-driven interfaces
- Physical controls (joysticks/keyboards) supplement touch interaction
- Information density over simplicity
- Multi-hour gameplay sessions (2-6 hours typical)

### 1.2 Purpose of the Lobby Screen

The lobby is the **mission control center** where game masters:
- Start/stop game scenarios
- Load saved game states
- Assign players to ship stations
- Access administrative tools

**Users:** Game masters and players during setup/between missions
**Usage Context:** Large screens or projectors in a room with 4-20 people
**Interaction Mode:** Mouse/touchscreen with keyboard shortcuts

---

## 2. Design Philosophy & Aesthetic

### 2.1 Visual Style: Futuristic Sci-Fi UI

**Core Aesthetic:** Functional military/aerospace interfaces with futuristic elements

**Visual References:**
- NASA mission control interfaces
- Military radar displays
- Sci-fi UI from films like *The Martian*, *Interstellar*, *Oblivion*
- Cyberpunk/tech-noir color palettes
- Arwes framework sci-fi components (current implementation)

**NOT These:**
- Cartoonish or playful (avoid Fortnite, Among Us aesthetics)
- Over-stylized fantasy (avoid Star Wars hologram effects)
- Minimalist flat design (avoid iOS/Material Design simplicity)
- Retro pixelated (avoid 8-bit game aesthetics)

### 2.2 Color Palette

**Primary Colors:**
- **Background:** Deep black (#000000) or very dark blue-black (#0a0e27)
- **Primary UI Elements:** Pure cyan (#00FFFF, hsl(180, 100%, 50%))
- **Accent 1:** Orange (#FF6600, hsl(24, 100%, 50%))
- **Accent 2:** Cyan-blue (#00AAFF)

**Semantic Colors:**
- **Success/Go:** Green (hsl(120, 50%, 40%))
- **Error/Stop:** Red (hsl(10, 50%, 48%))
- **Warning:** Orange-yellow (#FFA500)
- **Disabled:** 50% opacity of primary color

**Transparency Guidelines:**
- Text: 80-100% opacity on dark backgrounds
- UI frames: 10-20% fill, 100% stroke
- Hover states: 33% fill (use hex suffix `33` or `55`)

### 2.3 Typography

**Fonts:**
- **Primary Heading:** Electrolize (Google Fonts)
  - Geometric, technical, futuristic sans-serif
  - Use for: Main title, section headers
- **Body/UI Text:** Titillium Web (Google Fonts)
  - Clean, readable, technical feel
  - Use for: Button labels, descriptions, data

**Hierarchy:**
- H1 (Page Title): 48-64px, Electrolize, uppercase, letter-spacing: 0.1em
- H2 (Section): 32-40px, Electrolize
- H3 (Card Titles): 24-28px, Electrolize
- Body: 14-16px, Titillium Web
- Button Labels: 14-16px, Titillium Web, uppercase or sentence case

### 2.4 Visual Elements

**Frames & Borders:**
- Corner bracket frames (like targeting reticles)
- 2px stroke width
- Animated line-drawing effect on appear
- Subtle glow/bloom effect

**Animations:**
- Entry animations: Fade + slide (200ms duration)
- Stagger effect for multiple elements (40ms delay between)
- Hover: Subtle background glow (150ms transition)
- Click: Brief flash + sound effect

**Depth & Layering:**
- No shadows (maintain flat depth aesthetic)
- Use border glow instead of drop shadows
- Layer separation via border color intensity

---

## 3. Functional Requirements

### 3.1 User States & Conditional Display

The lobby displays different content based on game state:

**State 1: Pre-Game (No Active Game)**
- Display: Load Game widget + New Game buttons
- Show: Game configuration options
- Hide: Ship station cards

**State 2: Active Game (Game Running)**
- Display: Stop Game + Save Game buttons
- Show: Ship station selection cards (one per active ship)
- Show: Game Master access card
- Hide: New Game buttons

**State 3: Utilities (Always Visible)**
- Input configuration tool
- Colyseus connection monitor (debug tool)

### 3.2 Core Components

#### 3.2.1 Page Header
- **Element:** Main title "Starwards"
- **Position:** Top center
- **Styling:** H1 typography, cyan color, animated frame brackets on sides

#### 3.2.2 Game Control Section (Admin Only)
**Pre-Game:**
- Load Game dropzone (drag-and-drop .ssg files)
- "2v1 Game" button (starts 2-vs-1 scenario)
- "Solo Game" button (starts single-player practice)

**In-Game:**
- "Stop Game" button (palette: error/red)
- "Save Game" button (palette: success/cyan)

#### 3.2.3 Game Master Card
- **Title:** "Game Master"
- **Image:** Nebula/space background photo
- **Description:** "Manage the game"
- **Action Button:** "Game Master" (navigates to gm.html)
- **Visual:** Hover effect with background glow

#### 3.2.4 Ship Station Cards (Dynamic, per active ship)
Each card represents one player ship in the game:

- **Title:** "Ship {ShipID}" (e.g., "Ship GVTS", "Ship GVTS2")
- **Image:** Fighter spacecraft photo
- **Description:** "Play as a fighter ship"
- **Action Buttons:** (arranged in grid/flex layout)
  - Layout buttons: Custom saved layouts from localStorage
  - "Empty Screen" (secondary palette)
  - "Weapons" (primary palette)
  - "Pilot" (primary palette)
  - "E.C.R" (Engineering Control Room, primary palette)
  - "Bridge Engineer" (primary palette)
  - "Signals" (primary palette, navigates to signals.html?ship={id})

**Layout:** Cards displayed in horizontal wrap or grid (max 3 per row)

#### 3.2.5 Utilities Section
- **Title:** "Utilities"
- **Buttons:**
  - "Input" (secondary palette) - Controller configuration
  - "Colyseus Monitor" (secondary palette) - Server debug tool

---

## 4. Layout Specification

### 4.1 Overall Page Structure

```
┌─────────────────────────────────────────────────────┐
│                   STARWARDS                         │ ← H1 Header
├─────────────────────────────────────────────────────┤
│  [Stop Game]  [Save Game]                          │ ← Admin Controls (conditional)
├─────────────────────────────────────────────────────┤
│  ┌──────────────┐  OR  ┌──────────────┐           │
│  │ Load Game    │      │ [2v1 Game]   │           │ ← Pre-game (conditional)
│  │ Dropzone     │      │ [Solo Game]  │           │
│  └──────────────┘      └──────────────┘           │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐│
│  │ Game Master │  │  Ship GVTS  │  │ Ship GVTS2  ││ ← Game cards (in-game)
│  │   Card      │  │    Card     │  │    Card     ││
│  └─────────────┘  └─────────────┘  └─────────────┘│
├─────────────────────────────────────────────────────┤
│                  UTILITIES                          │ ← Section Header
│           [Input]  [Colyseus Monitor]              │ ← Utility Buttons
└─────────────────────────────────────────────────────┘
```

### 4.2 Spacing & Grid

**Container:**
- Max width: None (full viewport)
- Padding: 20px all sides
- Background: #000000

**Sections:**
- Vertical spacing between sections: 40-60px
- Horizontal alignment: Center

**Card Grid:**
- Gap between cards: 16px
- Max cards per row: 3
- Card max-width: 400px
- Card min-width: 320px
- Cards: Inline-block or flex-wrap layout

### 4.3 Responsive Behavior

**Desktop (1920x1080+):**
- 3 cards per row
- Large spacing, full animations

**Tablet/Medium (1024-1919px):**
- 2 cards per row
- Maintained spacing

**Mobile/Small (<1024px):**
- Not primary target (LARP uses large screens)
- Stack cards vertically if needed
- Reduce padding to 12px

---

## 5. Component Detailed Specs

### 5.1 Button Component

**Visual Design:**
- Corner bracket frame (2px stroke)
- Frame color matches palette (primary/secondary/success/error)
- Transparent background (default)
- Padding: 12px horizontal, 24px vertical
- Text: Uppercase or sentence case, Titillium Web, 14-16px

**States:**
- **Default:** Frame visible, background transparent
- **Hover:** Frame glow, background 33% opacity of frame color
- **Active:** Background 66% opacity
- **Disabled:** 50% opacity, cursor not-allowed

**Animation:**
- Fade + slide on appear (200ms)
- Stagger with siblings (40ms delay)
- Sound effect on click (optional)

**Variants:**
- `palette="primary"` → Cyan (hsl(180, 100%, 53%), ~#00FFFF)
- `palette="secondary"` → Orange (#FF6600, hsl(24, 100%, 50%))
- `palette="success"` → Green (hsl(120, 50%, 40%))
- `palette="error"` → Red (hsl(10, 50%, 48%))

### 5.2 Card Component

**Visual Design:**
- Corner bracket frame (2px stroke, cyan)
- Background: 10% cyan fill
- Padding: 20px
- Max-width: 400px
- Border-radius: 0px (sharp corners)

**Structure:**
```
┌─────────────────────────┐
│ [Image - 100% width]    │ ← Optional header image
├─────────────────────────┤
│ Card Title              │ ← H3 typography
│ Description text        │ ← Body text
│                         │
│ [Button] [Button]       │ ← Action buttons (flex wrap)
│ [Button] [Button]       │
└─────────────────────────┘
```

**Image:**
- Full width
- Height: Auto (maintain aspect ratio)
- Margin-bottom: 16px

**Title:**
- H3 size (24-28px)
- Margin: 0 0 12px 0

**Description:**
- Body text size (14-16px)
- Color: 80% opacity

**Buttons:**
- Display: Flex wrap
- Gap: 8px
- Margin-top: 16px

**Hover State:**
- Background: 20% cyan fill (increase from 10%)
- Cursor: pointer
- Transition: 200ms

### 5.3 Load Game Dropzone

**Visual Design:**
- Dashed border frame (2px stroke)
- Background: Transparent (default) or 15% cyan (drag active)
- Width: 400px
- Height: 100px
- Padding: 16px

**States:**
- **Default:** Dashed cyan border, instruction text
- **Drag Over:** Solid border, success color, background 15% opacity
- **Error:** Red border, error message displayed

**Content:**
- Title: "Load Game" (H3)
- Instruction: "Click or Drop .ssg file here"
- Icon: Optional upload icon

**Feedback:**
- Error messages display in red-bordered blockquote
- Success: Game loads, screen transitions

---

## 6. Interaction Patterns

### 6.1 Navigation Flow

```
Lobby Screen
├─ Click "Game Master" button → Navigate to gm.html
├─ Click ship station button → Navigate to ship.html?ship={id}
├─ Click "Weapons" → Navigate to weapons.html?ship={id}
├─ Click "Pilot" → Navigate to pilot.html?ship={id}
├─ Click "E.C.R" → Navigate to ecr.html?station=ecr&ship={id}
├─ Click "Signals" → Navigate to signals.html?ship={id}
├─ Click "Input" → Navigate to input.html
└─ Click "Colyseus Monitor" → Navigate to colyseus-monitor
```

**Navigation Method:** Full page load (window.location.assign)
**No SPA routing** - each screen is separate HTML page

### 6.2 Game State Transitions

```
Pre-Game State
├─ Click "2v1 Game" → Start game scenario → In-Game State
├─ Click "Solo Game" → Start solo scenario → In-Game State
└─ Drop .ssg file → Load game → In-Game State

In-Game State
├─ Click "Stop Game" → Confirm → Pre-Game State
└─ Click "Save Game" → Download .ssg file → Stay in In-Game State
```

### 6.3 Interactive Affordances

**All Buttons:**
- Clear visual feedback on hover (glow effect)
- Sound effect on click (sci-fi "beep" or "click")
- Brief flash animation on click

**Cards:**
- Entire card has hover state (background glow)
- Cursor changes to pointer on hover
- Only clickable via buttons inside (not entire card)

**Dropzone:**
- Visual change on drag-over
- File type validation (.ssg files only)
- Error message if wrong file type

---

## 7. Technical Constraints

### 7.1 Framework & Technology

**Current Implementation:**
- React 18.3
- @arwes/react UI framework (futuristic sci-fi components)
- Emotion CSS-in-JS for styling
- WebSocket (Colyseus) for multiplayer sync

**Browser Targets:**
- Modern Chrome/Edge (primary)
- Firefox (secondary)
- No IE11 support required

### 7.2 Performance Requirements

- Initial render: <500ms
- Animation frame rate: 60fps
- Button click response: <100ms
- Page transitions: <300ms

### 7.3 Accessibility (Basic Level)

**Requirements:**
- Keyboard navigation for all buttons
- Tab order follows visual flow
- Focus indicators visible
- Text contrast ratio: 7:1 minimum (white on black)

**Not Required (LARP context):**
- Screen reader optimization (physical presence required)
- Mobile accessibility
- High contrast mode

---

## 8. Assets Required

### 8.1 Images

**Game Master Card:**
- **Filename:** `/images/photos/nebula.jpg`
- **Dimensions:** 400x225px (16:9 aspect ratio) minimum
- **Content:** Colorful nebula or deep space scene
- **Style:** NASA-quality space photography, not CGI

**Ship Cards:**
- **Filename:** `/images/photos/fighter-2.png`
- **Dimensions:** 400x225px minimum
- **Content:** Sleek fighter spacecraft
- **Style:** Hard sci-fi (similar to *The Expanse*, *Elite Dangerous*)
- **Angle:** 3/4 view showing ship details

### 8.2 Sound Effects (Optional)

**Button Click:**
- **Filename:** `/sound/click.mp3`
- **Duration:** 50-100ms
- **Style:** Sci-fi UI beep (not cartoonish)

**Background Ambient (Optional):**
- **Filename:** `/sound/ambient-loop.mp3`
- **Duration:** 30-60 seconds (seamless loop)
- **Style:** Subtle space station hum, no melody

### 8.3 Fonts

**Already Loaded:**
- Electrolize (via Google Fonts CDN)
- Titillium Web (via Google Fonts CDN)

**Additional (Optional):**
- Monospace font for technical readouts (e.g., Roboto Mono, Source Code Pro)

---

## 9. Design Deliverables Requested

### 9.1 High-Fidelity Mockups

Please provide pixel-perfect designs for:

1. **Lobby Screen - Pre-Game State** (1920x1080)
   - Load Game dropzone visible
   - New Game buttons visible
   - Utilities section
   - No ship cards

2. **Lobby Screen - In-Game State** (1920x1080)
   - Stop/Save Game buttons
   - Game Master card
   - 2 Ship cards (GVTS, GVTS2)
   - Utilities section

3. **Component States** (various sizes)
   - Button: Default, Hover, Active, Disabled
   - Card: Default, Hover
   - Dropzone: Default, Drag Over, Error

**Format:** Figma, Sketch, or Adobe XD (with design system/components)

### 9.2 Style Guide Document

- Color palette with hex values
- Typography scale with sizes, weights, line-heights
- Spacing system (8px base grid or custom)
- Animation timing curves and durations
- Shadow/glow specifications

### 9.3 Motion Design (Optional)

Short video or Lottie animations showing:
- Page entrance animations
- Card stagger effect
- Button hover/click feedback
- Dropzone drag-over interaction

---

## 10. Current Implementation Reference

**Live Demo:** http://localhost:3000 (when dev server running)

**Current State:**
- Basic layout implemented using Arwes framework
- Cyan color scheme established
- Corner bracket frames on buttons/cards
- Functional but needs professional design polish

**Improvement Priorities:**
1. **Visual Hierarchy:** Title → Game Controls → Ship Cards → Utilities
2. **Consistency:** Unified spacing, alignment, sizing
3. **Polish:** Smooth animations, consistent hover states
4. **Branding:** Establish "Starwards" visual identity

---

## 11. Design Constraints & Guidelines

### 11.1 DO's

✅ Use hard sci-fi aesthetics (NASA, military tech)
✅ High information density (show data, not decoration)
✅ Strong visual hierarchy via color, not size
✅ Corner brackets and geometric frames
✅ Cyan/turquoise as dominant color
✅ Subtle animations (functional, not flashy)
✅ Technical, serious tone

### 11.2 DON'Ts

❌ No playful or cartoonish elements
❌ No fantasy or magical aesthetics
❌ No rounded corners or soft shapes
❌ No gradient backgrounds or mesh gradients
❌ No drop shadows or 3D depth effects
❌ No excessive animations or motion
❌ No bright, saturated background colors

---

## 12. Questions for Designer

Please address these in your design:

1. **Card Layout:** Grid or masonry? Fixed columns or responsive wrap?
2. **Empty State:** How should lobby look when zero ships exist?
3. **Loading State:** Animation/indicator when game starting?
4. **Error Handling:** How to display connection errors or failures?
5. **Branding:** Should "Starwards" have a logo or wordmark?

---

## 13. Acceptance Criteria

Design will be approved if it meets:

- [x] Matches hard sci-fi aesthetic (not fantasy)
- [x] Clear visual hierarchy (title → controls → cards → utilities)
- [x] Consistent spacing and alignment throughout
- [x] All functional requirements implemented
- [x] Accessible text contrast (7:1 minimum)
- [x] Smooth animations at 60fps
- [x] Professional, polished appearance suitable for LARP events
- [x] Design system documented for future screens

---

## 14. Contact & Questions

For clarifications or design questions, please provide:
- Annotated mockups with questions
- Alternative design explorations (if proposing deviations)
- Rationale for design decisions

**Next Steps After Approval:**
1. Design handoff with assets
2. Implementation by development team
3. Design QA review of implementation
4. Iteration based on user testing

---

**End of Specification**
