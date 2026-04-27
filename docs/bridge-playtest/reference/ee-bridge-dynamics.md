# EmptyEpsilon Bridge Dynamics — 4-Station Layout Visual Reference

EE's 4-player configuration: **Tactical** (Helms+Weapons merged), **Engineering**, **Operations** (Science+Relay merged), **Captain** (consoleless).

All mechanics from the EE source-code-verified research dossier.

---

## 1. Information Locks & Verbal Handoffs

```mermaid
graph LR
    subgraph "INFORMATION LOCKS <i>(data at A, action at B, no bypass)</i>"
        O_freq["Ops: enemy shield frequency<br/><small>from deep scan, 0–20 (400–800 THz)</small>"]
        O_freq -->|"verbal: number every encounter<br/>🔁 RECURRENT NUMERICAL HANDOFF"| T_beam["Tactical: beam frequency dial"]

        O_bfreq["Ops: enemy beam frequency<br/><small>from deep scan</small>"]
        O_bfreq -->|"verbal: number every encounter<br/>🔁 RECURRENT NUMERICAL HANDOFF"| T_shield["Tactical: shield frequency dial<br/><small>25s offline during recalibration</small>"]

        O_dist["Ops: waypoint distance<br/><small>only Ops sees distance on sector map</small>"]
        O_dist -->|"verbal: distance for jump"| T_jump["Tactical: jump/warp execution"]

        E_power["Eng: per-system power allocation<br/><small>0–300% per system, 9 systems</small>"]
        E_power -->|"verbal: capability forecast"| Cap["Captain"]
    end

    subgraph "ASYMMETRIC READOUTS <i>(same object, different fields)</i>"
        AR_ops["Ops: sector-wide map<br/><small>all friendly ship sensors aggregated</small>"]
        AR_tac["Tactical: short-range radar only<br/><small>~5U around own ship</small>"]
        AR_eng["Eng: no radar at all<br/><small>internal systems view only</small>"]

        AR_ops -.->|"Ops sees contacts<br/>Tactical cannot"| AR_tac
        AR_ops -.->|"Ops sees sector<br/>Eng sees nothing external"| AR_eng
    end

    subgraph "AUTO-SHARED <i>(comms bypass — no verbal needed)</i>"
        AUTO1["Deep scan → beam arcs<br/><small>auto-appear on Tactical screen</small>"]
        AUTO2["Global energy level<br/><small>visible on Tactical + Eng</small>"]
        AUTO3["Shield strength<br/><small>visible on Tactical HUD</small>"]
        AUTO4["Ship identification after simple scan<br/><small>color-coded on all radars</small>"]
    end

    style O_freq fill:#1a3a5c,stroke:#4ecdc4,color:#fff
    style O_bfreq fill:#1a3a5c,stroke:#4ecdc4,color:#fff
    style O_dist fill:#1a3a5c,stroke:#4ecdc4,color:#fff
    style E_power fill:#1a3a5c,stroke:#4ecdc4,color:#fff
    style Cap fill:#1a1a1a,stroke:#d4d4d4,color:#fff
    style T_beam fill:#1a3a2c,stroke:#4ade80,color:#fff
    style T_shield fill:#1a3a2c,stroke:#4ade80,color:#fff
    style T_jump fill:#1a3a2c,stroke:#4ade80,color:#fff
    style AR_ops fill:#2a1a3c,stroke:#c084fc,color:#fff
    style AR_tac fill:#2a1a3c,stroke:#c084fc,color:#fff
    style AR_eng fill:#2a1a3c,stroke:#c084fc,color:#fff
    style AUTO1 fill:#1a1a1a,stroke:#666,color:#999
    style AUTO2 fill:#1a1a1a,stroke:#666,color:#999
    style AUTO3 fill:#1a1a1a,stroke:#666,color:#999
    style AUTO4 fill:#1a1a1a,stroke:#666,color:#999
```

---

## 2. Resource Flow (Energy → Heat → Damage Loop)

```mermaid
flowchart TD
    subgraph REACTOR ["REACTOR <small>(Eng controls 0–300% power)</small>"]
        R_power["power level 0–300%"]
        R_gen["energy generation<br/><small>effectiveness = power × health</small>"]
        R_power --> R_gen
    end

    R_gen -->|"fills"| E_pool["⚡ ENERGY POOL<br/><small>max 1000, shared, finite</small>"]

    subgraph CONSUMERS ["ENERGY CONSUMERS"]
        C_impulse["Impulse Engines<br/><small>Tactical: movement</small>"]
        C_warp["Warp / Jump Drive<br/><small>Tactical: FTL</small>"]
        C_beams["Beam Weapons<br/><small>Tactical: auto-fire in arc</small>"]
        C_missiles["Missile System<br/><small>Tactical: tube cycling</small>"]
        C_shields_f["Front Shields<br/><small>Tactical: absorb damage</small>"]
        C_shields_r["Rear Shields<br/><small>Tactical: absorb damage</small>"]
        C_maneuver["Maneuvering<br/><small>Tactical: turn rate + combat maneuver</small>"]
    end

    E_pool -->|"consumed by"| C_impulse
    E_pool -->|"consumed by"| C_warp
    E_pool -->|"consumed by"| C_beams
    E_pool -->|"consumed by"| C_missiles
    E_pool -->|"consumed by"| C_shields_f
    E_pool -->|"consumed by"| C_shields_r
    E_pool -->|"consumed by"| C_maneuver

    subgraph HEAT ["HEAT LOOP <small>(Eng manages coolant, total pool = 10)</small>"]
        H_formula["heat delta =<br/><small>1.7^(power-1) − (1.01 + coolant×0.1)</small>"]
        H_level["system heat 0.0–1.0"]
        H_formula --> H_level
    end

    C_impulse -->|"power > 100%"| H_formula
    C_beams -->|"power > 100%"| H_formula
    C_warp -->|"jump: +0.35 heat spike"| H_formula

    H_level -->|"heat > 1.0 overflow"| DMG["💥 OVERHEAT DAMAGE<br/><small>0.08 health/sec at sustained overheat</small>"]

    DMG --> Health["System Health<br/><small>−1.0 to +1.0</small><br/><small>negative = inoperable</small>"]

    Health -->|"effectiveness = power × health"| Output["System Output"]

    subgraph REPAIR ["REPAIR <small>(Eng dispatches crew)</small>"]
        Crew["Repair Crew<br/><small>click crew → click room</small>"]
        Crew -->|"+0.007 health/sec per crew<br/>~143s for full repair"| Health
        Crew -->|"+0.007 unhack/sec"| Hacked
    end

    Hacked["hacked_level 0–1.0<br/><small>from Ops hacking enemy</small>"]
    Hacked -->|"effective_power =<br/>max(0, power − hacked×0.75)"| Output

    style REACTOR fill:#0d2137,stroke:#4ecdc4,color:#fff
    style E_pool fill:#1a3a1a,stroke:#4ade80,color:#fff,font-weight:bold
    style CONSUMERS fill:#1a1a2e,stroke:#818cf8,color:#fff
    style HEAT fill:#2e1a0d,stroke:#fb923c,color:#fff
    style DMG fill:#3c0d0d,stroke:#f87171,color:#fff,font-weight:bold
    style REPAIR fill:#0d2e1a,stroke:#4ade80,color:#fff
    style Health fill:#1a1a1a,stroke:#fff,color:#fff
    style Hacked fill:#2e0d2e,stroke:#c084fc,color:#fff
    style Output fill:#0d2137,stroke:#4ecdc4,color:#fff
```

---

## 3. Per-Station Action Loops & Cross-Station Dependencies

```mermaid
flowchart TB
    subgraph TACTICAL ["🔵🔴 TACTICAL <small>(Helms + Weapons merged)</small>"]
        direction TB
        T1["fly ship<br/><small>impulse, heading, combat maneuver</small>"]
        T2["warp / jump drive"]
        T3["select targets on radar"]
        T4["fire beams <small>(auto in arc)</small>"]
        T5["load + fire missile tubes"]
        T6["set beam frequency dial"]
        T7["set shield frequency dial<br/><small>25s offline during change</small>"]
        T8["dock / undock"]
    end

    subgraph OPERATIONS ["🟡 OPERATIONS <small>(Science + Relay merged)</small>"]
        direction TB
        O1["long-range radar<br/><small>~25U radius</small>"]
        O2["simple scan<br/><small>slider mini-game: align N sliders<br/>within 0.05, hold 2s</small>"]
        O3["deep scan<br/><small>same mechanic, fewer sliders<br/>reveals frequencies + system health</small>"]
        O4["hack enemy system<br/><small>Lights Out 7×7 or Minesweeper 10×10<br/>select subsystem, solve puzzle</small>"]
        O5["launch probes<br/><small>up to 8, 10-min lifetime, 5U radius</small>"]
        O6["place waypoints<br/><small>bearing visible to all, distance only here</small>"]
        O7["comms with NPCs<br/><small>text menu, reputation cost</small>"]
        O8["link probe to own scan view"]
    end

    subgraph ENGINEERING ["🟢 ENGINEERING"]
        direction TB
        E1["power sliders per system<br/><small>0–300%, 9 systems, snap at 100%</small>"]
        E2["coolant sliders per system<br/><small>total pool = 10, zero-sum</small>"]
        E3["dispatch repair crew<br/><small>click crew → click room on ship map<br/>pathfinds through doors</small>"]
        E4["monitor system health + heat"]
        E5["self-destruct button"]
    end

    subgraph CAPTAIN ["⚪ CAPTAIN <small>(no console)</small>"]
        direction TB
        Cap1["main screen control<br/><small>rotate between views</small>"]
        Cap2["set priorities + doctrine"]
        Cap3["coordinate all stations"]
    end

    %% Ops → Tactical (frequency locks)
    O3 ==>|"🔒 shield freq number<br/>verbal every encounter"| T6
    O3 ==>|"🔒 beam freq number<br/>verbal every encounter"| T7
    O2 ==>|"scan reveals faction/type<br/>auto-colors all radars"| T3
    O3 ==>|"beam arcs auto-shared"| T1

    %% Ops → Tactical (waypoint distance)
    O6 ==>|"🔒 distance number<br/>verbal for jump safety"| T2

    %% Eng → Tactical (power)
    E1 ==>|"⚡ system effectiveness"| T1
    E1 ==>|"⚡ system effectiveness"| T4
    E1 ==>|"⚡ system effectiveness"| T5
    E1 ==>|"⚡ system effectiveness"| T2
    E2 ==>|"❄️ prevents overheat"| T1

    %% Eng → Ops (power to... nothing specific — Ops has no subsystem)
    E1 -.->|"⚡ power to reactor<br/><small>affects global energy</small>"| O1

    %% Tactical → Eng (demands)
    T1 -->|"energy drain + heat"| E4
    T4 -->|"energy drain + heat"| E4
    T5 -->|"energy drain"| E4
    T2 -->|"jump: heat spike + energy"| E4

    %% Ops → Eng (hacking results)
    O4 -->|"hack degrades enemy<br/><small>no direct effect on own Eng</small>"| T3

    %% Repair crew → unhack
    E3 -->|"unhack: 0.007/sec"| O4

    %% Captain verbal
    Cap2 -.->|"orders"| T1
    Cap2 -.->|"orders"| O1
    Cap2 -.->|"orders"| E1
    T3 -.->|"engagement status"| Cap3
    O1 -.->|"threat picture"| Cap3
    E4 -.->|"capability forecast"| Cap3

    style TACTICAL fill:#0d1b2a,stroke:#60a5fa,color:#fff
    style OPERATIONS fill:#1a1a0d,stroke:#facc15,color:#fff
    style ENGINEERING fill:#0d1a0d,stroke:#4ade80,color:#fff
    style CAPTAIN fill:#1a1a1a,stroke:#d4d4d4,color:#fff
```

---

## 4. Comms-Forcing Pattern Coverage

```mermaid
graph TD
    subgraph PRESENT ["✅ PATTERNS PRESENT"]
        direction TB
        IL["<b>Information Lock</b><br/>Ops → Tactical: shield freq (per encounter)<br/>Ops → Tactical: beam freq (per encounter)<br/>Ops → Tactical: waypoint distance<br/>Eng → Captain: power allocation detail"]

        RNH["<b>Recurrent Numerical Handoff</b><br/>Shield freq: fresh random number per enemy ship<br/>Must be spoken every new engagement<br/><i>EE's strongest single comms mechanic</i>"]

        CC["<b>Consoleless Coordinator</b><br/>Captain: no console, only main screen + voice<br/>'The bridge crew is playing via stations,<br/>the captain is playing via the bridge crew'"]

        IV["<b>Internal-View Role</b><br/>Engineering: no radar, no contacts, no heading<br/>Entirely dependent on inbound communication"]

        SD["<b>Scale Differential</b><br/>Tactical: ~5U short-range<br/>Ops: ~25U long-range + sector map<br/>Eng: 0U (no external view)"]

        PRI["<b>Per-Role Input Modality</b><br/>Tactical: heading taps + fire + frequency dials<br/>Ops: slider alignment + puzzle games + map clicks<br/>Eng: power/coolant sliders + crew dispatch"]

        CAC["<b>Cooperative Action Chain</b><br/>Jump escape: Ops→route, Ops→confirm clear,<br/>Eng→power drive, Tactical→drop mines,<br/>Tactical→execute jump, Eng→manage overheat"]

        RLP["<b>Range-Limited Action by Proxy</b><br/>Hacking requires target within 5U of ANY friendly<br/>If target moves out of range, puzzle closes<br/>Ops must ask Tactical to maintain proximity"]

        LAN["<b>Live Authority for Narrative</b><br/>GM screen: full real-time scenario editing<br/>Spawn/despawn ships, modify AI, trigger events"]
    end

    subgraph WEAK ["🟡 PATTERNS WEAKENED BY 4-STATION MERGE"]
        direction TB
        MERGE1["<b>Helms↔Weapons dependency LOST</b><br/>Merged into Tactical<br/>Ship facing vs. weapon arcs = one player<br/><i>EE's richest verbal exchange eliminated</i>"]

        MERGE2["<b>Science↔Relay dependency LOST</b><br/>Merged into Operations<br/>Probe launch + probe link = one player<br/>Scan + waypoint = one player<br/><i>No probe coordination conversation</i>"]
    end

    subgraph ANTIPATTERNS ["⚠️ ANTI-PATTERNS PRESENT"]
        direction TB
        AP_auto["<b>Auto-Pushed Data</b><br/>Deep scan beam arcs auto-appear on Tactical<br/>Global energy visible on Tactical + Eng<br/>Simple scan auto-colors all radars"]

        AP_solo["<b>Solo Minigame</b><br/>Hacking (Lights Out / Minesweeper) is entirely<br/>self-contained at Ops. No cross-station input.<br/><i>Developer acknowledges as placeholder (issue #467)</i>"]

        AP_flat["<b>Flat Workload</b><br/>Eng idle during calm transit<br/>Ops idle after all contacts scanned<br/>No staggered demand curves"]

        AP_conv["<b>Convention-Only Silos</b><br/>Global energy visible on multiple screens<br/>Physical proximity enables shoulder-surfing<br/>LAN table layout collapses info asymmetry"]
    end

    style PRESENT fill:#0d2e1a,stroke:#4ade80,color:#fff
    style WEAK fill:#2e2a0d,stroke:#facc15,color:#fff
    style ANTIPATTERNS fill:#2e0d0d,stroke:#f87171,color:#fff
```

---

## 5. The Effectiveness Formula Chain

```mermaid
flowchart LR
    Power["<b>power_level</b><br/>0.0–3.0<br/><small>set by Eng (300% max)</small>"]
    Health["<b>health</b><br/>−1.0 to +1.0<br/><small>negative = inoperable</small>"]
    Hacked["<b>hacked_level</b><br/>0.0–1.0<br/><small>+0.5 per successful hack</small>"]

    Power -->|"effective_power =<br/>max(0, power − hacked×0.75)"| EP["effective_power"]
    Hacked --> EP

    EP -->|"× max(0, health)"| EFF["<b>EFFECTIVENESS</b>"]
    Health --> EFF

    EFF -->|"determines"| Output["System Output<br/><small>beam damage, engine speed,<br/>shield regen, jump charge,<br/>missile cycling, turn rate</small>"]

    subgraph HEAT_DAMAGE ["Heat → Damage Path"]
        HD_formula["heat delta =<br/><small>1.7^(power−1) − (1.01 + coolant×0.1)</small>"]
        HD_level["heat 0.0–1.0"]
        HD_overflow["overflow → damage<br/><small>0.08 health/sec</small>"]
        HD_formula --> HD_level
        HD_level -->|"> 1.0"| HD_overflow
        HD_overflow --> Health
    end

    Power -->|"drives heat generation"| HD_formula

    subgraph REPAIR_PATH ["Repair Crew Path"]
        RC["crew in room<br/><small>+0.007 health/sec<br/>+0.007 unhack/sec</small>"]
        RC --> Health
        RC --> Hacked
    end

    style Power fill:#0d2e1a,stroke:#4ade80,color:#fff
    style Health fill:#1a1a1a,stroke:#fff,color:#fff
    style Hacked fill:#2e0d2e,stroke:#c084fc,color:#fff
    style EP fill:#1a1a2e,stroke:#818cf8,color:#fff
    style EFF fill:#1a1a1a,stroke:#fff,color:#fff,font-weight:bold
    style Output fill:#0d2137,stroke:#4ecdc4,color:#fff
    style HEAT_DAMAGE fill:#2e1a0d,stroke:#fb923c,color:#fff
    style REPAIR_PATH fill:#0d2e1a,stroke:#4ade80,color:#fff
```

---

## 6. Station Dependency Matrix (Directed Graph)

```mermaid
graph LR
    T["🔵🔴 TACTICAL<br/><small>Helms + Weapons</small>"]
    O["🟡 OPERATIONS<br/><small>Science + Relay</small>"]
    E["🟢 ENGINEERING"]
    C["⚪ CAPTAIN"]

    %% Strong mechanical
    E ==>|"power 0–300%<br/>coolant (pool=10)<br/>to ALL 9 systems"| T
    E ==>|"power to reactor<br/>→ global energy"| O

    O ==>|"🔒 shield freq<br/>🔒 beam freq<br/>🔁 per encounter"| T
    O ==>|"🔒 waypoint distance<br/>for jump safety"| T
    O ==>|"scan: ID contacts<br/>auto-colors radar"| T

    T ==>|"energy drain + heat<br/>→ damage to manage"| E

    %% Ops hacking (affects enemy, not own ship directly)
    O -->|"hack: degrades<br/>enemy systems"| T

    %% Range-limited proxy
    T -->|"must stay within 5U<br/>of hack target"| O

    %% Repair crew unhacks
    E -->|"crew unhacks:<br/>0.007/sec"| O

    %% Captain verbal
    C -.->|"orders"| T
    C -.->|"orders"| O
    C -.->|"orders"| E
    T -.->|"combat status"| C
    O -.->|"threat picture<br/>+ sector intel"| C
    E -.->|"capability<br/>forecast"| C

    %% Merged-away dependencies (ghost)
    T -.->|"⚠️ MERGED AWAY:<br/>Helms↔Weapons<br/>facing negotiation"| T
    O -.->|"⚠️ MERGED AWAY:<br/>Science↔Relay<br/>probe coordination"| O

    style T fill:#0d1b2a,stroke:#60a5fa,color:#fff
    style O fill:#1a1a0d,stroke:#facc15,color:#fff
    style E fill:#0d1a0d,stroke:#4ade80,color:#fff
    style C fill:#1a1a1a,stroke:#d4d4d4,color:#fff
```

---

## 7. EE Mini-Game Mechanics Summary

```mermaid
graph TD
    subgraph SCAN_SIMPLE ["OPS: Simple Scan"]
        SS1["select target on long-range radar"]
        SS2["slider mini-game appears<br/><small>N sliders (1–3 based on complexity)</small>"]
        SS3["align all sliders within 0.05 of target"]
        SS4["hold for 2 seconds → LOCKED"]
        SS5["result: faction + ship type revealed<br/><small>auto-colors on all radars</small>"]
        SS1 --> SS2 --> SS3 --> SS4 --> SS5
    end

    subgraph SCAN_DEEP ["OPS: Deep Scan"]
        DS1["requires simple scan complete"]
        DS2["slider mini-game again<br/><small>fewer sliders than simple scan</small>"]
        DS3["align + hold 2s"]
        DS4["result: shield freq graph (21 bars)<br/>beam freq graph, system health,<br/>beam arcs auto-pushed to Tactical"]
        DS1 --> DS2 --> DS3 --> DS4
    end

    subgraph HACK ["OPS: Hack"]
        H1["select target within 5U of any friendly"]
        H2["select subsystem from list<br/><small>reactor, beams, missiles, maneuver,<br/>impulse, warp, jump, front/rear shields</small>"]
        H3{"random game"}
        H4["Lights Out 7×7<br/><small>toggle cells + neighbors<br/>goal: all lit, no failure state</small>"]
        H5["Minesweeper 10×10<br/><small>10 mines, reveal all non-mines<br/>fail on 2nd mine hit</small>"]
        H6["success: +0.5 hacked_level<br/><small>2 hacks = 100% hacked<br/>target runs at 25% power</small>"]
        H1 --> H2 --> H3
        H3 -->|"Lights Out"| H4 --> H6
        H3 -->|"Minesweeper"| H5 --> H6
    end

    subgraph REPAIR_CREW ["ENG: Repair Crew Dispatch"]
        RC1["see damage on ship interior map<br/><small>red-tinted rooms</small>"]
        RC2["click crew member to select"]
        RC3["click destination room"]
        RC4["crew pathfinds through doors<br/><small>move_speed = 2.0 cells/sec</small>"]
        RC5["crew in room: +0.007 health/sec<br/><small>~143s full repair, stacks with more crew</small>"]
        RC1 --> RC2 --> RC3 --> RC4 --> RC5
    end

    subgraph POWER_COOLANT ["ENG: Power + Coolant Balancing"]
        PC1["drag power slider 0–300%"]
        PC2["drag coolant slider 0–10<br/><small>finite pool, zero-sum</small>"]
        PC3["monitor heat arrows<br/><small>up = heating, down = cooling</small>"]
        PC4["overheat warning at > 0.9"]
        PC1 --> PC3
        PC2 --> PC3
        PC3 --> PC4
    end

    style SCAN_SIMPLE fill:#1a1a0d,stroke:#facc15,color:#fff
    style SCAN_DEEP fill:#1a1a0d,stroke:#facc15,color:#fff
    style HACK fill:#2e0d2e,stroke:#c084fc,color:#fff
    style REPAIR_CREW fill:#0d1a0d,stroke:#4ade80,color:#fff
    style POWER_COOLANT fill:#0d2137,stroke:#4ecdc4,color:#fff
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `==>` | Strong mechanical dependency |
| `-->` | Mechanical flow |
| `-.->` | Verbal / implicit |
| 🔒 | Information Lock pattern |
| 🔁 | Recurrent Numerical Handoff |
| ⚠️ | Lost due to station merge |
