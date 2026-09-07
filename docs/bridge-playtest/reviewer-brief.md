# Reviewer brief — internal bridge playtest

2026-09-07. Legend: ✓ = confirmed as of 2026-09-07 · ~ = likely, unconfirmed.

## Setup & reporting

- Run `starwards.exe` (Windows 10/11 only, unsigned — on the SmartScreen warning click **More info → Run anyway**; allow Firewall access). A console window opens and your browser opens the lobby at `http://localhost:8080`. Keep the console open.
- Stations open from the lobby buttons; phones/tablets on the same Wi-Fi join via the lobby's "Connect other devices" QR code. Solo: GM screen in one tab, a crew station in another. **SPACE** shows each station's hotkeys.
- Build version: bottom-right of the lobby page (e.g. `v0.4.2-7-gabc1234`).
- Report: open a GitHub issue on starwards/starwards with the **Playtest feedback** template. Fields: Build · Station(s) played · Solo or group? · What confused you? · What felt good? · Anything broken? (screenshot helps) · Anything else? No need to reproduce or diagnose.

## 1. What you are testing

- Starwards: multiplayer spaceship-bridge sim for LARP; one ship, stations Pilot / Weapons / Engineer / Signals, floating Captain, GM runs the world.
- This build: keyboard + screen only, no physical controls, 4 seats + Captain + GM.
- Scenario **Wave Defence**: defend 3 friendly stations (large, small, chain-gun platform) vs endless escalating raider waves spawning ~140 km out, alternating targets. No victory; ends when last station dies.
- Design rule "malfunction over destruction": damage breaks systems, player ship never dies.

## 2. The milestone and the bar

Milestone: runnable 30–60 min sitting with 5 novices. Bar: eight "game-worthy" criteria (set 2026-08-30).

| # | Criterion | Plain meaning | Expected in this build |
|---|---|---|---|
| G1 | Five seats, no collisions | Browser holds its station an hour, survives reload, no silent rebind | holds |
| G2 | Every station has a loop | Something to decide/do ≥ once a minute, unprompted | wanted |
| G3 | Competence in 5 min | One-page brief suffices, core loop without GM coaching | will fail — no one-pagers; use SPACE hotkey list |
| G4 | Beginning, middle, end in 60 min | Run terminates by scenario logic, not GM/clock | n/a — endless loss arc by design |
| G5 | Cross-station dependency | ≥ 2 decisions per station need another seat | wanted |
| G6 | Feedback legible without narration | Hits, kills, damage, scans, repairs show on own screen | holds |
| G7 | GM can run and rescue | GM sees ship health, seat state, repair queue; unsticks without debugger | holds |
| G8 | No session-ending defect | No soft-lock, lost command, forced reload | untested — any soft-lock/reload is a real finding |

Work plan M1–M5 ✓:

| Milestone | Status | Landed |
|---|---|---|
| M1 unstrand 08-16 fixes | done | all 16 Aug weapons complaints merged |
| M2 seats + GM control (G1/G7) | done | station registry, GM seat assignment, generic station page; GM repair-queue; Windows `.exe` reviewer track |
| M3 session arc + seat polish (G4/G2/G6) | mostly done | Signals jobs list, pilot mode-lock merged; wave progression (#2234) in review — not in your build |
| M4 ammo retune, Signals QA | open | blocked on engine defect #2236 |
| M5 one-pagers, freeze, dress rehearsal, live testplay | not started | G3, G8 never tested end to end |

### Not in scope (cut 2026-08-01+; reports filed, not acted on)

Physical/OSC surfaces (framework only) · per-plate armour rewrite, spare plates · reactive armour · finite coolant · scenario loading/editor (wave map is hand-written) · AI handicap (difficulty = weaker enemy hulls) · Relay/Navigator seats (Relay screen in lobby, not in session) · pilot waypoint visibility · morale, fleeing, ship explosions · internet play (LAN only) · macOS/Linux.

## 3. Known — do not report

Skip unless behaviour differs from the description.

| Area | What you will notice | Status |
|---|---|---|
| Combat balance | Stations die in 12–20 s under fire; raiders rarely die to NPC guns | Open #2236 ✓ — blast damage is dwell-time integral; blocks ammo retune |
| Enemy AI | Raider out of selected ammo goes silent, armed, nearby | Open #2237 ✓ |
| Waves | Crippled raiders never "cleared"; wave stalls | Fix in review (#2234) ✓; post-fix waves may overlap (8-min interval) |
| Session end | No win; defeat message, speed 0 after last station | By design (2026-08-02, 2026-09-06) ✓ |
| Player ship | Cannot die; armour restored only by docking | By design, "PCs immortal" ✓ |
| Pacing | Minutes of dead air per wave; cadence ~6–8 min | Accepted risk ✓ — report only how it felt (§4) |
| Signals | Level 2 "SNAPSHOT" shows live data | Accepted; per-faction projection post-event ✓ |
| Signals | Edge-flicker contact resets scan progress | Accepted ✓ |
| Signals | No "start scan"; levers = prioritise / cancel / pause / beam | By design ✓ |
| Weapons ↔ Signals | Scan level only changes display, not targeting | Open, optional M3.5, may be cut ✓ |
| Weapons | No low-ammo warning, no projectile tracking | Accepted cosmetic ✓ |
| NPC hull spin | Raiders spinning instead of shooting | Fixed on master ✓; adversary-AI upgrade parked ✓ |
| Engineer | No in-flight armour repair; docking renews plates (ECR queue), restocks ammo | By design ✓ — restock visibility is fair feedback |
| Engineer | Coolant unlimited | Cut |
| Pilot | Smart pilot broken/hacked in VELOCITY/TARGET: stick dead until DIRECT | Deliberate ✓; onboarding line owed |
| Pilot | Mode snapping back to DIRECT | Fixed 2026-09-02 — report if recurs |
| Weapons (16 Aug) | Long TTK, no hit feedback, lock lost on occlusion, orbiting missiles, friendlies first in cycle, energy drain | Fixed 31 Aug–1 Sep; retune unchecked by humans — impressions welcome |
| GM screen | Health scalar, repair-queue widget, roster, seat assignment | Shipped; needs recent build |
| Radar (8 Aug) | Same blip per hull, explosions as contacts, idle overheating, ECR repair buttons | Fixed 2026-08-08 |
| Enemy death | Dead raider = inert Derelict, no explosion | By design; animation cut |
| Onboarding | No station/captain cards, no GM runbook; SPACE = hotkeys | Known gap, M5.1–M5.2 not started |
| Platform | Windows only, unsigned `.exe`, LAN only, fixed scenario | Known limitation |
| Layout | Overflow / stray scrollbars | Old issue #958, repro unknown ~ — screenshot useful |

## 4. Where feedback IS wanted

- **Readability** — friend vs foe, live vs Derelict at a glance; blips as hull sizes; arcs and scan beam legible?
- **G2 loop** — which seat dull, for how many minutes; which overloaded; first moment with nothing to decide.
- **G5 crew talk** — what you needed from another seat; did screens show it or did someone have to ask; solo: where you wished another watcher.
- **Pacing** — 140 km approach meant as repair/reposition window; did it feel so; when did tension start.
- **G3 onboarding** — time to core loop with SPACE list only; first mistake; what a one-page card must say.
- **G6 legibility** — knew when hit / hitting / scan done / repair done / restocked? Which only via GM screen?
- **GM screen** — fight state readable from scalar + roster; what you wanted and could not find.
- **G8 session-ending** — stuck state, dead command, forced reload: screenshot + build string, no repro/diagnosis. Highest value.

## 5. Which build do you have

`.exe` from the rolling `master-latest` release; version string bottom-right of lobby → paste into the report's Build field (a build older than 2026-09-07 lacks GM seat assignment; the wave-progression fix #2234 is in no build yet).
