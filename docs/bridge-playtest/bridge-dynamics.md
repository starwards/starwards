# Bridge Dynamics — Visual Reference

Four stations (Pilot, Weapons, Bridge Engineering, Signals) + floating Captain.
Diagrams use the comms-forcing pattern vocabulary from the research dossier.

---

## 1. Information Locks & Verbal Handoffs

What data lives at exactly one station and is needed by another.
Solid lines = mechanically enforced (code). Dashed = verbal/implicit only.

```mermaid
graph LR
    subgraph "INFORMATION LOCKS <i>(data at A, action at B, no bypass)</i>"
        E_freq["Eng: warp frequency<br/><small>/warp/standbyFrequency</small>"]
        E_freq -->|"verbal: current freq"| P_warp["Pilot: warp level control"]

        S_scan["Signals: scan level result<br/><small>/Spaceship/{id}/scanLevels</small>"]
        S_scan -->|"gates radar blip rendering"| W_radar["Weapons: tactical radar"]
        S_scan -->|"gates radar blip rendering"| P_radar["Pilot: pilot radar"]

        E_power["Eng: per-system power levels<br/><small>/{system}/power</small>"]
        E_power -->|"verbal: capability forecast"| Cap["Captain"]
    end

    subgraph "ASYMMETRIC READOUTS <i>(same object, different fields)</i>"
        AR1_eng["Eng: full systems table<br/><small>all defectibles, heat, power</small>"]
        AR1_pilot["Pilot: filtered systems<br/><small>thrusters, warp, maneuver, radar, smartPilot</small>"]
        AR1_weap["Weapons: filtered systems<br/><small>chainGun, tubes, magazine, radar</small>"]
        AR1_sig["Signals: filtered systems<br/><small>radar only</small>"]

        AR1_eng -.->|"only Eng sees heat/defectibles"| AR1_pilot
        AR1_eng -.->|"only Eng sees heat/defectibles"| AR1_weap
        AR1_eng -.->|"only Eng sees heat/defectibles"| AR1_sig
    end

    subgraph "NO LOCK EXISTS <i>(gap — data is implicit or absent)</i>"
        W_target["Weapons: current target<br/><small>/weaponsTarget</small>"]
        W_target -.->|"verbal only"| S_intel["Signals: independent selection"]

        P_pos["Pilot: ship position/heading"]
        P_pos -.->|"implicit via space state"| W_arcs["Weapons: needs orientation for hits"]
        P_pos -.->|"implicit via space state"| S_range["Signals: target in scan range?"]
    end

    style E_freq fill:#1a3a5c,stroke:#4ecdc4,color:#fff
    style S_scan fill:#1a3a5c,stroke:#4ecdc4,color:#fff
    style E_power fill:#1a3a5c,stroke:#4ecdc4,color:#fff
    style AR1_eng fill:#2a1a3c,stroke:#c084fc,color:#fff
    style AR1_pilot fill:#2a1a3c,stroke:#c084fc,color:#fff
    style AR1_weap fill:#2a1a3c,stroke:#c084fc,color:#fff
    style AR1_sig fill:#2a1a3c,stroke:#c084fc,color:#fff
    style W_target fill:#3c1a1a,stroke:#f87171,color:#fff
    style P_pos fill:#3c1a1a,stroke:#f87171,color:#fff
    style W_arcs fill:#3c1a1a,stroke:#f87171,color:#fff
    style S_range fill:#3c1a1a,stroke:#f87171,color:#fff
    style S_intel fill:#3c1a1a,stroke:#f87171,color:#fff
    style Cap fill:#1a3a2c,stroke:#4ade80,color:#fff
    style P_warp fill:#1a3a2c,stroke:#4ade80,color:#fff
    style W_radar fill:#1a3a2c,stroke:#4ade80,color:#fff
    style P_radar fill:#1a3a2c,stroke:#4ade80,color:#fff
```

---

## 2. Resource Flow (Energy → Heat → Damage Loop)

The mechanical engine that couples all stations.

```mermaid
flowchart TD
    subgraph REACTOR ["REACTOR <small>(Eng controls power level)</small>"]
        R_power["power level<br/>0 / 0.25 / 0.5 / 0.75 / 1.0"]
        R_gen["energy generation<br/><small>effectiveness = power × (1 - hacked)</small>"]
        R_power --> R_gen
    end

    R_gen -->|"fills"| E_pool["⚡ ENERGY POOL<br/><small>shared, finite</small>"]

    subgraph CONSUMERS ["ENERGY CONSUMERS <small>(station activity drains pool)</small>"]
        C_thrust["Thrusters<br/><small>Pilot: movement</small>"]
        C_warp["Warp Drive<br/><small>Pilot: FTL</small>"]
        C_chain["Chain Gun<br/><small>Weapons: firing</small>"]
        C_tubes["Torpedo Tubes<br/><small>Weapons: loading</small>"]
        C_radar["Radar<br/><small>All: detection</small>"]
        C_maneuver["Maneuvering<br/><small>Pilot: rotation + afterburner</small>"]
    end

    E_pool -->|"consumed by"| C_thrust
    E_pool -->|"consumed by"| C_warp
    E_pool -->|"consumed by"| C_chain
    E_pool -->|"consumed by"| C_tubes
    E_pool -->|"consumed by"| C_radar
    E_pool -->|"consumed by"| C_maneuver

    subgraph HEAT ["HEAT LOOP <small>(Eng manages coolant)</small>"]
        H_gen["heat generated<br/><small>when EPM > threshold</small>"]
        H_cool["coolant allocation<br/><small>finite total, Eng distributes</small>"]
        H_level["system heat level"]
        H_gen --> H_level
        H_cool -->|"removes heat"| H_level
    end

    C_thrust -->|"energy spend"| H_gen
    C_warp -->|"energy spend"| H_gen
    C_chain -->|"energy spend"| H_gen
    C_tubes -->|"energy spend"| H_gen
    C_radar -->|"energy spend"| H_gen

    H_level -->|"heat > MAX_SYSTEM_HEAT"| DMG["💥 DAMAGE<br/><small>damageManager.damageSystem()</small>"]

    subgraph DAMAGE_EFFECTS ["DAMAGE EFFECTS"]
        D_defect["@defectible properties degrade<br/><small>thruster.bearingSkew, radar.malfunctionRangeFactor, etc.</small>"]
        D_broken["system.broken = true<br/><small>effectiveness → 0</small>"]
    end

    DMG --> D_defect
    D_defect -->|"past threshold"| D_broken

    D_defect -->|"degrades Pilot"| C_thrust
    D_defect -->|"degrades Weapons"| C_chain
    D_defect -->|"degrades Signals"| C_radar
    D_broken -->|"system offline"| E_pool

    style REACTOR fill:#0d2137,stroke:#4ecdc4,color:#fff
    style E_pool fill:#1a3a1a,stroke:#4ade80,color:#fff,font-weight:bold
    style CONSUMERS fill:#1a1a2e,stroke:#818cf8,color:#fff
    style HEAT fill:#2e1a0d,stroke:#fb923c,color:#fff
    style DMG fill:#3c0d0d,stroke:#f87171,color:#fff,font-weight:bold
    style DAMAGE_EFFECTS fill:#2e0d0d,stroke:#f87171,color:#fff
```

---

## 3. Per-Station Action Loops & Cross-Station Dependencies

Each station's core loop and what it needs from / supplies to others.

```mermaid
flowchart TB
    subgraph PILOT ["🔵 PILOT"]
        direction TB
        P1["fly ship<br/><small>rotation, strafe, boost</small>"]
        P2["manage warp<br/><small>level up/down</small>"]
        P3["dock/undock"]
        P4["read pilot radar"]
    end

    subgraph WEAPONS ["🔴 WEAPONS"]
        direction TB
        W1["select & cycle targets<br/><small>filters: ship/enemy/short-range</small>"]
        W2["fire chain gun"]
        W3["load & fire torpedoes<br/><small>select ammo type</small>"]
        W4["read tactical radar<br/><small>5000m range</small>"]
    end

    subgraph ENGINEERING ["🟢 ENGINEERING"]
        direction TB
        E1["allocate power per system<br/><small>0 / 0.25 / 0.5 / 0.75 / 1.0</small>"]
        E2["allocate coolant per system<br/><small>finite total pool</small>"]
        E3["monitor full systems table<br/><small>status, heat, defectibles</small>"]
        E4["⬜ repair damaged systems<br/><small>NOT YET BUILT — mini-game TBD</small>"]
        E5["set warp frequency"]
    end

    subgraph SIGNALS ["🟡 SIGNALS"]
        direction TB
        S1["long-range radar<br/><small>50km default, up to 250km</small>"]
        S2["select targets independently<br/><small>own SelectionContainer</small>"]
        S3["🟡 scan targets<br/><small>mechanics built server-side; station UI for queuing jobs TBD</small>"]
        S4["🟡 hack enemy systems<br/><small>mechanics built server-side; station UI for queuing jobs TBD</small>"]
    end

    subgraph CAPTAIN ["⚪ CAPTAIN <small>(no UI, no controls)</small>"]
        direction TB
        Cap1["set priorities<br/><small>objective vs survival vs intel</small>"]
        Cap2["route decisions<br/><small>who does what when</small>"]
        Cap3["manage comms noise<br/><small>filter signal from chatter</small>"]
    end

    %% DEPENDENCIES: who needs whom

    %% Engineering → Everyone (power/coolant)
    E1 ==>|"⚡ power level"| P1
    E1 ==>|"⚡ power level"| W2
    E1 ==>|"⚡ power level"| W3
    E1 ==>|"⚡ power level"| S1
    E2 ==>|"❄️ coolant"| P1
    E2 ==>|"❄️ coolant"| W2
    E2 ==>|"❄️ coolant"| S1

    %% Engineering → Pilot (warp freq)
    E5 -->|"🔒 INFO LOCK<br/>verbal only"| P2

    %% Pilot → Weapons (orientation)
    P1 -->|"ship heading<br/><small>implicit</small>"| W4

    %% Signals → Weapons/Pilot (scan intel)
    S3 -.->|"🔒 INFO LOCK<br/>scan level gates blips"| W4
    S3 -.->|"🔒 INFO LOCK<br/>scan level gates blips"| P4

    %% Signals → Weapons (hack)
    S4 -.->|"softened target<br/><small>hacked field reduces effectiveness</small>"| W1

    %% Pilot/Weapons → Engineering (damage + heat)
    P1 -->|"energy spend → heat"| E3
    W2 -->|"energy spend → heat"| E3
    W3 -->|"energy spend → heat"| E3

    %% Combat → Engineering (damage)
    W4 -->|"combat exposure → damage"| E3

    %% Captain ↔ Everyone (verbal)
    Cap1 -.->|"orders"| P1
    Cap1 -.->|"orders"| W1
    Cap1 -.->|"orders"| E1
    Cap1 -.->|"orders"| S2
    E3 -.->|"status reports"| Cap2
    S1 -.->|"threat picture"| Cap2
    W4 -.->|"engagement status"| Cap2

    style PILOT fill:#0d1b2a,stroke:#60a5fa,color:#fff
    style WEAPONS fill:#1a0d0d,stroke:#f87171,color:#fff
    style ENGINEERING fill:#0d1a0d,stroke:#4ade80,color:#fff
    style SIGNALS fill:#1a1a0d,stroke:#facc15,color:#fff
    style CAPTAIN fill:#1a1a1a,stroke:#d4d4d4,color:#fff
```

---

## 4. Comms-Forcing Pattern Coverage

Which patterns from the catalog are present, partial, or missing in the current Starwards bridge.

```mermaid
graph TD
    subgraph PRESENT ["✅ PATTERNS PRESENT IN CODE"]
        direction TB
        IL["<b>Information Lock</b><br/>Eng → Pilot: warp frequency<br/>Signals → All: scan level gates radar<br/>Eng → All: per-system power/coolant"]

        AR["<b>Asymmetric Readout</b><br/>systemsStatus filtered per station<br/>Eng sees full table + defectibles<br/>Others see own systems only"]

        CC["<b>Consoleless Coordinator</b><br/>Captain: no station, no UI<br/>derives role from partial views"]

        IV["<b>Internal-View Role</b><br/>Eng sees only systems table<br/>no radar, no contacts, no heading"]

        PRI["<b>Per-Role Input Modality</b><br/>Pilot: WASD + gamepad axes<br/>Weapons: target cycle + fire keys<br/>Eng: power/coolant hotkey pairs<br/>Signals: radar + selection"]
    end

    subgraph PARTIAL ["🟡 PATTERNS PARTIAL"]
        direction TB
        SD["<b>Scale Differential</b><br/>Signals: 50–250km long-range radar<br/>Weapons: 5km tactical radar<br/>Pilot: pilot radar<br/><i>⚠ No sector/strategic scale yet</i>"]

        CAC["<b>Cooperative Action Chain</b><br/>Warp sequence: Eng power → Eng freq → Pilot level<br/><i>⚠ Only 2 stations, short chain</i><br/><i>⚠ No 3+ station chains exist</i>"]

        RNH["<b>Recurrent Numerical Handoff</b><br/>Warp frequency is a number (W770–W810Hz)<br/><i>⚠ Rarely changes mid-session</i><br/><i>⚠ No per-encounter fresh number like EE's shield freq</i>"]
    end

    subgraph MISSING ["❌ PATTERNS MISSING"]
        direction TB
        FRT["<b>Forced Report Trigger</b><br/><i>No mechanical event forces a station</i><br/><i>to announce anything. Comms depend</i><br/><i>entirely on captain prompting or</i><br/><i>player initiative.</i>"]

        RLP["<b>Range-Limited Action by Proxy</b><br/><i>No action requires another station's</i><br/><i>positioning to be correct. Signals can</i><br/><i>scan anything on radar regardless of</i><br/><i>ship position.</i>"]

        SOLO["<b>Anti-pattern: Solo Minigame</b><br/><i>Risk: if scan/hack/repair mini-games</i><br/><i>are self-contained, they'll isolate the</i><br/><i>player. Design them with cross-station</i><br/><i>inputs (difficulty, data, timing).</i>"]
    end

    style PRESENT fill:#0d2e1a,stroke:#4ade80,color:#fff
    style PARTIAL fill:#2e2a0d,stroke:#facc15,color:#fff
    style MISSING fill:#2e0d0d,stroke:#f87171,color:#fff
```

---

## 5. The Effectiveness Formula Chain

How a single system's output is determined — the mechanical core that makes Engineering load-bearing.

```mermaid
flowchart LR
    Power["<b>power</b><br/>0–1.0<br/><small>set by Eng</small>"]
    Coolant["<b>coolantFactor</b><br/>ratio of total<br/><small>set by Eng</small>"]
    Hacked["<b>hacked</b><br/>0–1.0<br/><small>set by enemy Signals</small>"]
    Broken["<b>broken</b><br/>true/false<br/><small>from defectible threshold</small>"]

    Power -->|"×"| EFF
    Hacked -->|"× (1 - hacked)"| EFF
    Broken -->|"if broken → 0"| EFF

    EFF["<b>EFFECTIVENESS</b><br/><small>system.ts:106</small>"]

    EFF -->|"determines"| Output["System Output<br/><small>thrust, fire rate,<br/>scan range, warp speed,<br/>energy generation</small>"]

    Coolant -->|"reduces heat"| Heat["Heat Level"]
    Power -->|"increases heat<br/><small>when EPM > threshold</small>"| Heat
    Heat -->|"> MAX_SYSTEM_HEAT"| Damage["Damage →<br/>defectibles degrade"]
    Damage -->|"past threshold"| Broken

    style Power fill:#0d2e1a,stroke:#4ade80,color:#fff
    style Coolant fill:#0d1b2a,stroke:#60a5fa,color:#fff
    style Hacked fill:#2e0d2e,stroke:#c084fc,color:#fff
    style Broken fill:#2e0d0d,stroke:#f87171,color:#fff
    style EFF fill:#1a1a1a,stroke:#fff,color:#fff,font-weight:bold
    style Output fill:#0d2137,stroke:#4ecdc4,color:#fff
    style Heat fill:#2e1a0d,stroke:#fb923c,color:#fff
    style Damage fill:#3c0d0d,stroke:#f87171,color:#fff
```

---

## 6. Station Dependency Matrix (Directed Graph)

Every dependency in one view. Edge labels show what flows. Thick = strong (mechanical). Thin = weak (verbal/implicit).

```mermaid
graph LR
    P["🔵 PILOT"]
    W["🔴 WEAPONS"]
    E["🟢 ENGINEERING"]
    S["🟡 SIGNALS"]
    C["⚪ CAPTAIN"]

    %% Strong mechanical dependencies (thick)
    E ==>|"power + coolant<br/>to ALL systems"| P
    E ==>|"power + coolant<br/>to ALL systems"| W
    E ==>|"power + coolant<br/>to /radar"| S
    E ==>|"warp frequency<br/>🔒 INFO LOCK"| P

    S ==>|"scan level<br/>🔒 INFO LOCK<br/>gates radar blips"| W
    S ==>|"scan level<br/>🔒 INFO LOCK<br/>gates radar blips"| P

    P ==>|"energy spend → heat → damage"| E
    W ==>|"energy spend → heat → damage"| E

    %% Weak / planned dependencies (thin)
    S -.->|"hack (planned)<br/>reduces enemy effectiveness"| W
    P -.->|"heading (implicit)<br/>for weapon arcs"| W
    P -.->|"combat exposure<br/>→ damage events"| E

    %% Captain verbal (dashed)
    C -.->|"orders + priorities"| P
    C -.->|"orders + priorities"| W
    C -.->|"orders + priorities"| E
    C -.->|"orders + priorities"| S
    P -.->|"status"| C
    W -.->|"status"| C
    E -.->|"capability forecast"| C
    S -.->|"threat picture"| C

    %% Gap: Weapons supplies nothing back
    W -.->|"❌ NOTHING<br/>(pure sink)"| P
    W -.->|"❌ NOTHING<br/>(pure sink)"| S

    style P fill:#0d1b2a,stroke:#60a5fa,color:#fff
    style W fill:#1a0d0d,stroke:#f87171,color:#fff
    style E fill:#0d1a0d,stroke:#4ade80,color:#fff
    style S fill:#1a1a0d,stroke:#facc15,color:#fff
    style C fill:#1a1a1a,stroke:#d4d4d4,color:#fff
```

---

## 7. What's Built vs. What's Missing (per mini-game pattern)

```mermaid
graph TD
    subgraph SCAN ["SIGNALS: Scan"]
        SC_built["✅ Scan level state model<br/>✅ Per-faction scan levels<br/>✅ Radar blip gating by level<br/>✅ Long-range radar widget"]
        SC_missing["❌ targetInfo scan-level gating<br/>❌ Model + intel fields"]
    end

    subgraph HACK ["SIGNALS: Hack"]
        HC_built["✅ hacked field on SystemState<br/>✅ Effectiveness formula uses hacked<br/>✅ power × coolantFactor × (1-hacked)"]
        HC_missing["❌ System selection UI"]
    end

    subgraph REPAIR ["ENGINEERING: Repair"]
        RP_built["✅ @defectible decorator system<br/>✅ Reflection API (getSystems)<br/>✅ system.getStatus() → OK/DAMAGED/DISABLED<br/>✅ DamageManager.damageSystem()<br/>✅ damage-report.tsx widget (exists)"]
        RP_missing["❌ Repair command (server-side)<br/>❌ Damage report on Eng screen<br/>❌ System selection model<br/>❌ Mini-game mechanic<br/>❌ Action-to-damage mapping<br/>❌ Gate existing defectible sliders"]
    end

    style SCAN fill:#1a1a0d,stroke:#facc15,color:#fff
    style HACK fill:#2e0d2e,stroke:#c084fc,color:#fff
    style REPAIR fill:#0d1a0d,stroke:#4ade80,color:#fff
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `==>` | Strong mechanical dependency (code-enforced) |
| `-->` | Mechanical flow (resource, state change) |
| `-.->` | Verbal / implicit / planned dependency |
| 🔒 | Information Lock pattern |
| ⬜ | Not yet built |
| ❌ | Missing / gap |
| ✅ | Present in code |
