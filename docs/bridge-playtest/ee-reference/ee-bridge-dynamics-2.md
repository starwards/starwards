# EmptyEpsilon — Bridge Dynamics: Visual Reference
*Companion to the Mini-Game Mechanics and Roles & Communication dossiers.*

Seven Mermaid diagrams covering the full communication architecture, information ownership, all three core mini-game pipelines, a canonical cooperative action chain, and the complete comms-forcing pattern taxonomy with anti-patterns.

**Shared legend**

| Visual | Meaning |
|---|---|
| Thick edge `==>` | **Information Lock** — data at A, action knob at B, no bypass |
| Dashed edge `-.->` | Verbal communication required — no automatic bridge |
| Solid edge `-->` | Data auto-shared; no voice needed |
| ⚡ | Comms bypass / auto-pushed data (anti-pattern risk) |
| 🔐 | Information Lock pattern instance |
| ⚠ | Time-critical coordination window |
| ❌ | No access — station cannot see this data |
| ⛔ | Anti-pattern node |

---

## 1 · Bridge Communication Architecture

Every station, every communication edge. Thick `==>` = Information Lock; dashed = verbal required; solid = automatic.

```mermaid
flowchart TD
    CAP(["🎖 CAPTAIN
    No console · voice only"])

    subgraph STRAT["STRATEGIC & SECTOR LAYER"]
        direction LR
        SCI(["🔭 SCIENCE
        25U radar · scan · freq graphs"])
        REL(["📡 RELAY
        sector map · probes · comms · hacking"])
    end

    subgraph TACT["TACTICAL LAYER · 5–10U"]
        direction LR
        HLM(["🛞 HELMS
        heading · speed · jump/warp"])
        WPN(["🔫 WEAPONS
        tubes · freq dials · shield str"])
    end

    ENG(["⚙ ENGINEERING
    no radar · power · coolant · repair crew"])

    %% ── Information Locks ─────────────────────────────────
    SCI == "🔐 enemy shield freq #" ==> WPN
    SCI == "🔐 enemy beam freq #" ==> WPN
    REL == "🔐 waypoint distance" ==> HLM

    %% ── Verbal: station reports up to Captain ──────────────
    SCI -. "contact ID · threat level" .-> CAP
    REL -. "ally status · reputation" .-> CAP
    ENG -. "energy / heat warning" .-> CAP

    %% ── Verbal: cross-station coordination ─────────────────
    REL -. "probe at X → link to Science?" .-> SCI
    ENG -. "shields recal · 25s window ⚠" .-> WPN
    HLM -. "need jump drive power" .-> ENG
    WPN -. "need shield / beam power" .-> ENG

    %% ── Verbal: Captain orders ──────────────────────────────
    CAP -. "heading orders" .-> HLM
    CAP -. "target priority" .-> WPN
    CAP -. "power priorities" .-> ENG
    CAP -. "comms / diplomacy orders" .-> REL

    %% ── Auto flows (⚡ comms bypasses) ──────────────────────
    SCI -- "⚡ beam arcs after deep scan" --> HLM & WPN
    REL -- "⚡ waypoint bearing" --> HLM
    REL -- "⚡ alert level overlay" --> HLM & WPN & SCI & ENG

    classDef station fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    classDef captain fill:#ede9fe,stroke:#7c3aed,color:#2e1065
    class SCI,REL,HLM,WPN,ENG station
    class CAP captain
```

---

## 2 · Information Domain Ownership

Which station exclusively owns each data domain (amber = forces verbal relay) versus which data is shared across multiple stations (teal = bypass risk). The Captain owns nothing and cannot self-service any domain.

```mermaid
flowchart LR
    CAP(["🎖 CAPTAIN"])
    SCI(["🔭 SCIENCE"])
    REL(["📡 RELAY"])
    HLM(["🛞 HELMS"])
    WPN(["🔫 WEAPONS"])
    ENG(["⚙ ENGINEERING"])

    subgraph EXCL["EXCLUSIVELY OWNED — verbal relay mandatory"]
        E1["Scan results · freq graphs
        system health % · 25U long-range radar"]
        E2["Sector map · waypoint distances
        comms log · probe positions"]
        E3["System grid · power/heat/coolant
        repair crew positions"]
    end

    subgraph SHARE["SHARED — ⚡ comms bypass risk"]
        S1["Local radar 5–10U"]
        S2["Global ship energy"]
        S3["Enemy beam arcs
        (post deep-scan auto-push)"]
        S4["Alert level
        (Relay-broadcast to all)"]
    end

    %% Ownership (solid = has access)
    SCI --> E1
    REL --> E2
    ENG --> E3

    HLM & WPN --> S1
    HLM & WPN & ENG --> S2
    HLM & WPN --> S3
    HLM & WPN & SCI & ENG --> S4

    %% Captain: no direct access to any exclusive domain
    CAP -. "❌ no direct access" .-> E1
    CAP -. "❌ no direct access" .-> E2
    CAP -. "❌ no direct access" .-> E3

    classDef station fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    classDef captain fill:#ede9fe,stroke:#7c3aed,color:#2e1065
    classDef excl fill:#fef3c7,stroke:#d97706,color:#451a03
    classDef share fill:#ccfbf1,stroke:#0d9488,color:#134e4a
    class SCI,REL,HLM,WPN,ENG station
    class CAP captain
    class E1,E2,E3 excl
    class S1,S2,S3,S4 share
```

---

## 3 · Science Scan Pipeline

Two-round slider mini-game. Each round: hold all sliders within 0.05 of their hidden targets for 2 continuous seconds. The downstream split at Full Scan shows what is auto-pushed vs. what requires verbal handoff.

```mermaid
flowchart TD
    START(["Science selects target on radar"])
    --> R1_INIT

    subgraph R1["ROUND 1 · SIMPLE SCAN"]
        R1_INIT["Sliders initialised
        Random start ≥ 0.2 from target
        1–4 sliders per scan_complexity"]
        R1_ADJ["Player adjusts sliders
        Labels: Electric sig · Gravity well
        Ionic phase · Doppler stability …"]
        R1_CHK{"All sliders
        within 0.05?"}
        R1_LCK["LOCKED
        2-second hold timer starts"]
        R1_DFT{"Still within
        0.05 after 2s?"}
        R1_OK["scan_depth + 1"]

        R1_INIT --> R1_ADJ --> R1_CHK
        R1_CHK -- "No" --> R1_ADJ
        R1_CHK -- "Yes" --> R1_LCK --> R1_DFT
        R1_DFT -- "Drift detected
        lock resets" --> R1_ADJ
        R1_DFT -- "✓ Held 2s" --> R1_OK
    end

    R1_OK --> SS(["SIMPLE SCAN COMPLETE
    Faction · ship class on ALL station radars"])
    --> R2_INIT

    subgraph R2["ROUND 2 · FULL / DEEP SCAN"]
        R2_INIT["New random targets
        Fewer sliders at SC_Normal"]
        R2_ADJ["Player adjusts sliders"]
        R2_CHK{"All sliders
        within 0.05?"}
        R2_LCK["LOCKED
        2-second hold timer starts"]
        R2_DFT{"Still within
        0.05 after 2s?"}
        R2_OK["scan_depth + 1"]

        R2_INIT --> R2_ADJ --> R2_CHK
        R2_CHK -- "No" --> R2_ADJ
        R2_CHK -- "Yes" --> R2_LCK --> R2_DFT
        R2_DFT -- "Drift" --> R2_ADJ
        R2_DFT -- "✓ Held 2s" --> R2_OK
    end

    R2_OK --> FS(["FULL SCAN COMPLETE"])

    FS --> SCI_OUT["🔭 SCIENCE only:
    Shield freq graph — 21 bars 400–800 THz
    Beam freq graph
    All target system health %"]

    FS --> AUTO_OUT["⚡ AUTO to HELMS + WEAPONS
    Enemy beam firing arcs now visible
    No verbal handoff needed"]

    FS --> VERB_OUT["🔐 VERBAL — SCI → WEAPONS
    Optimal beam freq # to set (0–20)
    Defensive shield freq # to match (0–20)
    Warning: shield recal = 25s downtime ⚠"]

    classDef terminal fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef auto fill:#f3e8ff,stroke:#9333ea,color:#4c1d95
    classDef lock fill:#fef3c7,stroke:#d97706,color:#451a03
    class SS,FS terminal
    class AUTO_OUT auto
    class VERB_OUT lock
```

---

## 4 · Relay Hacking Mini-Game

Both mini-game variants, the range requirement that creates a Helms dependency, and the downstream effect chain. Note the anti-pattern: no automatic notification to other stations on success.

```mermaid
flowchart TD
    START(["Relay selects enemy on sector map"])
    --> RNG

    RNG{"Target within 5U of
    any friendly object?"}
    RNG -- "No" --> WAIT["Ask Helms to reposition
    or wait for ally ship coverage"]
    WAIT --> RNG
    RNG -- "Yes" --> PICK

    PICK["Select target subsystem:
    Reactor · Beams · Missiles · Maneuvering
    Impulse · Warp · Jump · Front/Rear Shield"]
    --> GSEL

    GSEL{"Server hacking_games
    setting"}
    GSEL -- "HG_Lights" --> LO_I
    GSEL -- "HG_Mine" --> MS_I
    GSEL -- "HG_All (random)" --> LO_I

    subgraph LO["LIGHTS OUT VARIANT"]
        LO_I["7×7 grid at difficulty 2
        49 toggle cells · all start lit
        Random scramble applied"]
        LO_P["Click cell → toggles that cell
        + 4 orthogonal neighbours"]
        LO_W{"All 49 cells lit?"}
        LO_R["Reset (new scramble)
        No failure state — unlimited moves"]

        LO_I --> LO_P --> LO_W
        LO_W -- "No" --> LO_P
        LO_W -- "Stuck" --> LO_R --> LO_I
        LO_W -- "✓ Yes" --> WIN
    end

    subgraph MS["MINESWEEPER VARIANT"]
        MS_I["10×10 grid at difficulty 2
        10 mines hidden"]
        MS_P["Click to reveal · flag mode available"]
        MS_W{"All non-mine
        cells revealed?"}
        MS_F{"Mines hit?"}
        MS_R["2nd mine hit → board resets
        (1 mine allowed, 2nd = fail)"]

        MS_I --> MS_P
        MS_P --> MS_W & MS_F
        MS_W -- "No" --> MS_P
        MS_W -- "✓ Yes" --> WIN
        MS_F -- "1st hit — continue" --> MS_P
        MS_F -- "2nd hit — fail" --> MS_R --> MS_I
    end

    WIN(["HACK SUCCESS
    hacked_level + 0.5 on target system
    capped at 1.0 (two hacks = max)"])

    WIN --> EFF["Penalty applied to target:
    effective_power = max(0, power − hacked × 0.75)
    1 hack → ~62.5% effective
    2 hacks → 25% effective"]

    EFF --> REC["Target Engineering crew counters:
    0.007 hacked_level/s in affected room
    ~143s to fully reverse one hack"]

    EFF -. "⛔ NO auto-notification
    Relay must verbally announce:
    which system · current penalty" .-> VOUT["🔐 VERBAL — REL → CAP/all:
    System X hacked · effect level · ENG alerted"]

    classDef terminal fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef anti fill:#fee2e2,stroke:#dc2626,color:#450a0a
    classDef lock fill:#fef3c7,stroke:#d97706,color:#451a03
    class WIN terminal
    class VOUT lock
    class WAIT anti
```

---

## 5 · Engineering Power–Heat–Repair Loop

The continuous resource-management cycle. Engineering is radar-blind — all external context arrives as verbal orders (left side). The Relay hacking side-chain shows how the two stations interact through the repair crew.

```mermaid
flowchart LR
    subgraph IN["INPUTS (Engineering screen)"]
        PWR["Power slider
        0–300% per system
        9 systems total"]
        COOL["Coolant allocation
        0–10 units/system
        10 units shared pool"]
        CMD["⬅ VERBAL ONLY
        Captain / stations
        send combat context
        Engineering is radar-blind"]
    end

    subgraph HLOOP["HEAT LOOP"]
        DLT{"Heat delta
        = 1.7^(power−1)
        − (1.01 + coolant × 0.1)"}
        SAFE(["Delta ≤ 0
        System cooling ✓"])
        RISE(["Delta > 0
        Heat rising ⚠"])
        OVER["Heat reaches 1.0
        OVERHEAT
        −0.08 health/s"]
    end

    subgraph RLOOP["DAMAGE & REPAIR LOOP"]
        DMG["System health
        range: −1.0 to +1.0
        below 0 = inoperable"]
        CREW["Repair crew dispatched
        2 cells/s movement
        0.007 health/s repair
        ~143s for full restore"]
    end

    subgraph HKLOOP["RELAY HACKING CHAIN"]
        HKPEN["hacked_level +0.5/hack
        cap 1.0
        penalty: −hacked × 0.75 power"]
        UNHK["Crew un-hacks in parallel:
        0.007 hacked_level/s
        while in affected room"]
    end

    subgraph EFFOUT["EFFECTIVE OUTPUT"]
        EFF["System effectiveness
        = power × health − hacked × 0.75"]
        OUT(["Beam damage
        Shield regen
        Engine speed
        Jump charge rate"])
    end

    CMD --> PWR
    PWR --> DLT
    COOL --> DLT
    DLT --> SAFE & RISE
    RISE --> OVER
    OVER --> DMG
    SAFE --> EFF
    DMG --> CREW
    CREW --> DMG
    CREW --> UNHK
    UNHK --> HKPEN
    HKPEN --> EFF
    DMG --> EFF
    EFF --> OUT

    classDef good fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef warn fill:#fef9c3,stroke:#ca8a04,color:#422006
    classDef danger fill:#fee2e2,stroke:#dc2626,color:#450a0a
    class SAFE good
    class RISE warn
    class OVER danger
```

---

## 6 · Cooperative Action Chain — Jump Drive Escape

A canonical six-station sequential chain. Every station speaks; no station can act until the previous step is confirmed. This is the purest instance of the Cooperative Action Chain pattern in EE.

```mermaid
sequenceDiagram
    participant CAP as 🎖 Captain
    participant REL as 📡 Relay
    participant SCI as 🔭 Science
    participant HLM as 🛞 Helms
    participant WPN as 🔫 Weapons
    participant ENG as ⚙ Engineering

    Note over CAP,ENG: Trigger: escape under fire via jump drive

    CAP->>REL: "Find a safe jump destination"
    REL-->>CAP: "Sector G7 clear — 12U, bearing 045"

    CAP->>SCI: "Confirm G7, any contacts or nebulae?"
    SCI-->>CAP: "G7 confirmed clear"

    CAP->>ENG: "Full power to jump drive, now"
    ENG-->>CAP: "Charging — 90s at max power. Heat rising on jump system."

    CAP->>WPN: "Load mine drop for jump cover"
    WPN-->>CAP: "Mines loaded — ready on your mark"

    CAP->>HLM: "Set bearing 045, distance 12U"
    HLM-->>CAP: "Set — waiting on drive charge"

    Note over ENG: Routes coolant to jump drive and monitors heat

    CAP->>WPN: "Drop mines — mark"
    activate WPN
    WPN-->>CAP: "Mines away"
    deactivate WPN

    CAP->>HLM: "Jump — mark"
    activate HLM
    Note over HLM: 10-second activation delay
    HLM-->>ENG: "Jumping in 10"
    ENG-->>WPN: "⚠ Post-jump: shields recalibrating 25s"
    WPN-->>CAP: "Shields down 25s — holding fire"
    HLM-->>CAP: "Jump complete — position G7"
    deactivate HLM

    activate ENG
    ENG-->>CAP: "⚠ Heat spike +0.35 on jump drive — monitoring"
    deactivate ENG

    CAP->>SCI: "Scan new position"
    SCI-->>CAP: "G7 clear. Resuming long-range patrol."
```

---

## 7 · Pattern Taxonomy and Anti-Patterns

Which EE mechanics implement which comms-forcing patterns (strong = mechanically enforced; weak = convention-dependent or partial), and which anti-patterns undermine them.

```mermaid
flowchart TD
    subgraph STRONG["STRONG — mechanically enforced"]
        P1["🔐 Information Lock"]
        P2["📊 Asymmetric Readout"]
        P3["🎖 Consoleless Coordinator"]
        P4["🗺 Scale Differential"]
        P5["🔢 Recurrent Numerical Handoff"]
        P6["🔲 Internal-View Role"]
        P7["🔗 Cooperative Action Chain"]
        P8["📍 Range-Limited by Proxy"]
    end

    subgraph WEAK["WEAK / PARTIAL — convention or incomplete"]
        P9["⚡ Forced Report Trigger
        Not implemented — convention only
        No mechanic compels announcements"]
        P10["🎮 Per-Role Input Modality
        Partial — scan sliders · hacking
        puzzles · repair crew floor plan"]
        P11["🎬 Live Authority for Narrative
        Strong — but in separate GM role
        not integrated into station design"]
    end

    subgraph MECH["EE MECHANICS"]
        M1["SCI → WPN freq handoff
        after every deep scan"]
        M2["REL bearing ≠ distance split
        SCI 25U vs HLM/WPN 5–10U"]
        M3["Captain: no console
        voice and main screen only"]
        M4["ENG: zero radar
        blind to all external events"]
        M5["3-tier radar scale
        ENG none / SCI 25U / REL sector"]
        M6["Freq # rerolls per enemy ship
        new handoff each combat"]
        M7["6-station jump escape chain
        REL → SCI → ENG → WPN → HLM"]
        M8["Hack range: 5U from any friendly
        Relay depends on Helms position"]
    end

    P1 --> M1
    P2 --> M2
    P3 --> M3
    P4 --> M5
    P5 --> M6
    P6 --> M4
    P7 --> M7
    P8 --> M8
    P1 & P5 --> M6

    subgraph AP["⛔ ANTI-PATTERNS"]
        AP1["⚡ Auto-pushed beam arcs
        SCI → HLM/WPN without Science
        announcing — cuts verbal handoff"]
        AP2["🧩 Hacking is a solo puzzle
        Relay solves alone, no Science
        dependency (GitHub #467 since 2017)"]
        AP3["🔀 Station merging
        Tactical = HLM+WPN
        Ops = SCI+REL
        kills dependencies it wraps"]
        AP4["👁 Convention-only silos
        Global energy on HLM+WPN+ENG
        screens — Engineering not unique"]
        AP5["😴 Flat workload cycles
        ENG / REL / SCI all idle during
        same lull phases simultaneously"]
    end

    AP1 -. "undermines" .-> P1
    AP1 -. "undermines" .-> P5
    AP2 -. "undermines" .-> P8
    AP3 -. "undermines" .-> P7
    AP3 -. "undermines" .-> P2
    AP4 -. "undermines" .-> P6
    AP4 -. "undermines" .-> P2
    AP5 -. "undermines" .-> P10

    classDef strong fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    classDef weak fill:#f0fdf4,stroke:#16a34a,color:#14532d
    classDef mech fill:#fef3c7,stroke:#d97706,color:#451a03
    classDef anti fill:#fee2e2,stroke:#dc2626,color:#450a0a
    class P1,P2,P3,P4,P5,P6,P7,P8 strong
    class P9,P10,P11 weak
    class M1,M2,M3,M4,M5,M6,M7,M8 mech
    class AP1,AP2,AP3,AP4,AP5 anti
```
