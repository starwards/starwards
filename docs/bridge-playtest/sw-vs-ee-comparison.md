# SW vs EE — Metrics Comparison (5-Role Baseline)

Side-by-side comparison of Starwards (current build) against EmptyEpsilon
(5-role layout: Helms, Weapons, Engineering, Operations, Captain).

## Metric-by-Metric

| # | Metric | SW | EE (5-role) | Gap | Severity |
|---|--------|-----|------------|-----|----------|
| 1 | Edge count | 17 | 22 | -5 | Missing arc negotiation + info cascades |
| 2 | Edge type balance | resource 0.41 | info-push 0.32 | skewed | SW too resource-centric, needs info edges |
| 3 | Bidirectionality | 0.50 | 0.80 | **-0.30** | 5 one-way pairs vs 2 |
| 4 | In/out degree | Wep out=1 | all 3–7 | **critical** | Weapons is a dead end |
| 5 | Exclusive domains | Sig=1, Wep=1 | Ops=9, Wep=2 | moderate | Signals hollow; Weapons has nothing to say |
| 6 | Info locks | 2 | 6 | **-4** | No per-encounter locks at all |
| 7 | Auto-share leakage | 0.50 | 0.45 | ~same | Both moderate |
| 8 | Action demand | Pilot=2.0, Eng=3.0, Sig=1.0 | Hlm=1.5, Eng=3.0, Ops=2.25 | Sig empty | Signals has 2 trivial actions |
| 9 | Input variety | Eng=1, Sig=1 | Eng=2, Ops=4 | Sig/Eng low | Both are monotonous in SW |
| 10 | Failure gradient | Pilot=3, Eng=3, Ops=n/a | Ops=1.0, Eng=3.0 | **SW better** | No binary tasks yet (but Sig unscored) |
| 11 | Interruption cost | all None–Low | Ops Low–Med | **SW better** | No comms islands |
| 12 | Skill ceiling | Pilot=Deep, Eng=Deep | Hlm=Deep, Eng=Deep | ~same | Pilot deeper than EE Helms (Newtonian) |
| 13 | Handoff edges/trigger | avg 2.2 | Cmd=3.8, Alt=5.3 | **~half** | Root cause: no info lock cascades |
| 14 | Phase coverage | Wep cruise=0.1, Sig combat=0.2 | Wep cruise=0.1, Eng=0.2 | **worse** | SW has *two* near-idle stations |
| 15 | Demand stagger | 1 (Wep combat-only) | 1 (Wep combat-only) | same | But SW double idle overlap in cruise |
| 16 | Decision ratio | Sig=0.33 | all >0.50 | **Sig passive** | Signals is a dashboard |
| 17 | Cognitive variety | Sig=1/5 | all 4/5 | **critical** | Signals has one cognitive mode |
| 18 | Cognitive load | Sig=Under-loaded | Ops=Heavy | **opposite** | SW underloads where EE overloads |
| 19 | Load alignment | Wep=0.14 | Wep=0.44 | **-0.30** | SW Weapons barely talks |
| 20 | Captain leverage | 0.64 | 0.75 | -0.11 | Fewer decisions exist to influence |

## Where SW is Stronger than EE

- **Failure gradient** — all existing actions are continuous (no binary pass/fail).
  EE's Ops is all-binary. Design the scan/hack mini-games to preserve this.
- **Interruption cost** — no comms islands. Every station can talk freely.
  Don't repeat EE's hacking mistake.
- **Pilot skill ceiling** — Newtonian flight is deeper than EE's point-and-click
  heading.
- **No auto-push anti-pattern** (yet) — scan level auto-applies to radars, but
  SW has fewer comms bypasses overall.

## Where SW is Critically Weaker

1. **Information locks (2 vs 6).** No per-encounter mechanism. EE forces a fresh
   number spoken every combat. SW's locks fire ≤1× per session. This is the #1
   design lever.

2. **Signals is hollow.** Under-loaded, 1/5 cognitive modes, 0.33 decision ratio,
   0.2 combat coverage. The station barely exists as a gameplay role.

3. **Weapons is a pure sink.** Out-degree 1, load alignment 0.14, zero unique
   info to share. EE Weapons talks to Helms (arcs) and Ops (freq) constantly.
   SW Weapons talks to nobody.

4. **Bidirectionality (0.50 vs 0.80).** Five pairs are one-way: Eng→Signals,
   Pilot→Weapons, Signals→Pilot, Signals→Weapons, Cap→Weapons. No return channels.

5. **Handoff density (~half of EE).** Average 2.2 edges per trigger vs EE's
   3.8–5.3. Events don't cascade through the bridge.

## Three Highest-Leverage Design Moves

1. **Add a recurrent numerical handoff** — a number that changes per engagement,
   lives at Signals, and is consumed by Weapons. This single mechanic would add
   ~2 info locks, create the Signals→Weapons verbal channel, raise handoff
   density, and give Signals a combat role.

2. **Give Weapons an outbound info channel** — target status, hit confirmation,
   ammo state, or weapon readiness that other stations need. This fixes the sink
   problem and raises bidirectionality.

3. **Design scan/hack with cross-station input** — not self-contained puzzles.
   Require Pilot positioning or Engineering power allocation as inputs to the
   mini-game. This creates edges, raises Signals' cognitive load, and avoids the
   Solo Minigame anti-pattern.

## Expanded Design Moves (gap-closing plan)

The three moves above are the spine. The moves below extend each lever into
concrete mechanics, target specific metric gaps, and explicitly preserve
SW's existing advantages over EE (continuous failure, no comms islands,
Newtonian flight, no auto-push leakage).

### A. Per-encounter information locks — three candidates, not just one

EE wins this metric (6 vs 2) by stacking *multiple* recurrent locks per fight,
not one mega-lock. Stack two-to-three lightweight locks rather than one
heavy "frequency dial" clone. Each should be a fresh value per encounter,
discoverable only at one station, mechanically required at another.

| Lock candidate | Source | Consumer | Mechanic | Locks added |
|---|---|---|---|---|
| **Threat ID code** | Signals (scan tier 2) | Weapons (target lock arms) | 4-char alphanumeric revealed by scan; Weapons must enter to enable max-damage shot | +1 |
| **Hull weak vector** | Signals (scan tier 3) | Pilot (approach angle) + Weapons (shot timing) | A bearing range (e.g. 070°–110° relative) where damage multiplier applies; degrades over 30–60s, must be re-scanned | +2 |
| **Hostile reactor signature** | Engineering (ECR) | Weapons (torpedo arming) | Engineer reads the contact's own reactor harmonic from passive ECR; weapons enters it to arm a torpedo with proximity fuse | +1 |
| **Jam window** | Signals | Pilot (warp gate) | Per-encounter time-of-day where enemy comms hiccup; pilot can warp-disengage cleanly only inside window | +1 |

Picking any **two** of these closes the lock gap (2→4–5) without copying EE's
frequency dial. Crucially each one expires per encounter — the *recurrence*
is what generates handoff density, not the value itself.

**Preserves SW strengths:** all are continuous-failure (partial code = partial
bonus), and none requires a focused mini-game that traps the speaker.

### B. Concrete outbound channels for Weapons (fix out-degree=1)

Weapons needs to *produce* information that other stations can't see and must
act on. Five candidates, ordered by how much they raise bidirectionality
relative to build cost:

1. **Hit confirmation + estimated damage** → Captain, Pilot.
   Today damage is server-side opaque. Surface a Weapons-only "estimated
   target hull %" derived from rounds-on-target. Captain uses it to decide
   pursue/disengage; Pilot uses it to decide whether to close.
   *Adds 2 edges (Wep→Cap, Wep→Pilot). Bidirectionality: Cap↔Wep one-way → bidirectional.*

2. **Ammo state forecast** → Engineering, Captain.
   Weapons-only knowledge of "I'll be dry in 90s at this rate." Engineer needs
   it to decide whether to power magazine for reloads vs. divert to repair.
   *Adds 1 edge, raises Eng↔Wep info content.*

3. **Arc-blocking heading request** → Pilot.
   Weapons must request a heading change when the chain gun arc is masked by
   the ship's own geometry. This is the EE Helms↔Tactical bond, adapted.
   *Adds 1 edge, makes Pilot↔Wep bidirectional. Highest-impact single move
   for Weapons.*

4. **Threat triage** → Captain.
   Weapons sees range/closure/threat-class; can call out "the lead ship is
   the priority" before Captain decides. Captain picks; Weapons executes.
   *Strengthens Wep→Cap (currently empty).*

5. **Tube readiness broadcast** → Captain, Pilot.
   "Tube 2 cooked in 8 seconds — hold your turn." Pilot must coordinate
   approach vector with tube-ready time.
   *Adds 1 edge, deepens Pilot↔Wep.*

Adopting #1, #3, #5 raises Weapons out-degree from 1 to 4 and load alignment
from 0.14 toward 0.40 — close to EE's 0.44.

### C. Cruise-phase content (kill the double-idle)

The double-idle in cruise (Wep 0.1, Sig 0.2) is structural, not content-light.
Cruise needs *role-specific work* that the same station can't do during combat.

**Weapons cruise tasks:**
- **Calibration drills** — fire-against-debris with scoring; degrades over
  time without practice. Skill-floor maintenance with a captain-readable score.
- **Tube maintenance** — periodic engineering-coordinated cooldown rituals
  (Eng cuts magazine power, Wep purges tube). Forced bidirectional handoff.
- **Resupply negotiation** at docks — Wep counts inventory, Cap negotiates,
  Eng manages cargo power. Three-way cruise-phase task.

**Signals cruise tasks:**
- **Long-range triangulation** — Signals correlates contacts across waypoints,
  builds a threat map. Pilot must hold heading for triangulation lock.
  Cross-station input + Signals exclusive output.
- **Passive intel decode** — slow burn-in scans on distant contacts that
  generate the per-encounter lock values *before* combat starts. Cruise
  effort pays off in combat handoff.
- **Comms log review** — Signals receives narrative chatter from GM; must
  summarize verbally to Captain. Low-mechanical, high-roleplay task that
  fills cruise with talking, not silence.

These raise cruise phase coverage Wep 0.1→0.4, Sig 0.3→0.6, and stagger
score from 1 toward 0 (no station >70% single-phase).

### D. Fix the five one-way pairs explicitly

| Pair | Current direction | Add return channel | Mechanic |
|---|---|---|---|
| Eng → Signals | power only | Signals → Eng | Signals reports "hostile EW pressure on radar" — Eng must boost radar power; without comms, Eng cannot tell radar is being jammed |
| Pilot → Weapons | orientation only | Weapons → Pilot | Arc-blocking heading request (move B.3) |
| Signals → Pilot | scan gating | Pilot → Signals | Pilot requests "scan in this cone" — Signals can prioritize but must hold sensor lobe; pilot heading affects scan quality |
| Signals → Weapons | scan gating | Weapons → Signals | Weapons requests "rescan, my lock decayed" — adds a recurrent verbal trigger |
| Cap → Weapons | orders only | Weapons → Cap | Threat triage + hit confirmation (moves B.1, B.4) |

All five fixable with content from moves A and B. Bidirectionality goes
0.50 → 0.90 (10/10 if all five close, 9/10 if four close).

### E. Cascade triggers (raise handoff density 2.2 → 3.5+)

EE's handoff density comes from triggers that *cascade* across 3+ stations,
not from many small triggers. Design two new trigger templates:

1. **"New hostile contact" cascade**
   - Signals: contact appears on long-range → calls bearing/range to Cap
   - Cap: orders scan priority → Signals begins scan
   - Signals: yields threat ID + weak vector → calls to Weapons + Pilot
   - Pilot: adjusts approach to weak-vector arc → confirms to Cap
   - Weapons: enters threat ID → confirms armed to Cap
   - **6 edges from one trigger.** Today this fires 2 edges.

2. **"System overheat" cascade**
   - Eng: detects overheat → reports to affected station + Cap
   - Cap: chooses tradeoff — divert coolant, or have station ease off
   - Eng OR station: executes; reports back
   - Eng: confirms back-in-band to Cap
   - **4 edges from one trigger.** Today fires 2.

Building these requires the new locks (move A) and the new outbound channels
(move B); the cascade is what turns them from disconnected mechanics into a
*bridge*.

### F. Dedicate a `/signals` subsystem

The interdependency-matrix doc flags this as open. **Strong recommendation: do it.**
Today Signals piggybacks on `/radar` (shared with Pilot/Weapons), so Engineering
cannot make a Signals-vs-Pilot/Weapons tradeoff — they all rise and fall
together. A separate `/signals` subsystem with its own power and coolant
allocation:

- Adds Eng→Sig as a *real* allocation choice (not a shared dial). Bidirectionality.
- Lets scan speed/range be a function of Engineering allocation. Cross-station input for the mini-game (move 3 from the original three).
- Creates the heat→damage loop for Signals (scan generates heat; overscan breaks the system; Eng must coolant-balance against Wep). This makes Signals participate in the same combat-stress loop Wep and Pilot already do.

Cost: a new `SystemState` subclass, decorator wiring, a new column in
Engineering's panel. Mechanically small; structurally large.

### G. Add captain decision points (raise leverage 0.64 → 0.75)

EE's higher leverage comes from *more decisions to be in the middle of*. Each
of the moves above creates a captain decision:

| Decision added | From which move |
|---|---|
| "Take the threat-ID lock-on shot, or fire dumb?" | A (threat ID lock) |
| "Hold heading for Wep arc, or for Pilot escape?" | B.3 + D |
| "Spend cruise on calibration, triangulation, or rest?" | C |
| "Coolant to Signals or Weapons under load?" | F |
| "Pursue (per Wep damage estimate) or disengage?" | B.1 |

Five new strong-influence decisions. Leverage rises 0.64 → ~0.78.

### H. What NOT to do (preserve current strengths)

The metrics show four areas where SW is *better* than EE. Each move above
should be checked against this list before shipping:

1. **No binary failure modes.** Threat-ID lock should give partial bonus for
   partial code, not pass/fail. Weak-vector arc should be a damage *curve*,
   not in/out.
2. **No comms islands.** Scan and hack mini-games must be pausable, glance-
   able, resumable. The signals officer cannot ever be unable to speak.
3. **No auto-push.** When scan tiers reveal data, the data shows on the
   *Signals* console — not auto-painted on Pilot/Weapons radars without a
   verbal handoff. Color-coding the contact icon is the existing leak; new
   info must default to Signals-only.
4. **Pilot stays Newtonian.** Don't simplify flight to make Weapons-arc
   coordination easier. The arc-blocking request (B.3) should be Pilot's
   problem to solve as a flight challenge.

### I. PDC + Brace — one mechanic, five metrics

A high-leverage proposal: replace the chain gun (or augment it) with a
**Point Defense Cannon (PDC)** that is dual-use — offensive against ships,
defensive against incoming missiles. Pair it with a **Brace** mode the crew
commits to when PDC fails to intercept.

**Why it's high-leverage:** a single mechanic addresses Weapons' missing
outbound channel, per-encounter recurrence, cascade-trigger density,
captain leverage, and Weapons↔(Pilot/Eng/Sig) bidirectionality at the same
time. It also re-uses existing systems (directional armor plates, heat/
coolant loop, chain gun chassis).

**The flow:**

1. Enemy fires a missile salvo (new threat class).
2. **Signals** sees inbound at long range — calls "incoming, count three,
   bearing 040." (Sig combat content, +1 phase coverage point.)
3. **Weapons** picks up the salvo on the PDC tracker at close range,
   begins intercept. Hit probability is continuous (range × PDC power ×
   tracking solution).
4. If PDC saturation looks bad, Weapons calls **"BRACE."** This is the
   missing Weapons→bridge verbal artifact.
5. Crew commits:
   - **Engineering** auto-shunts power to armor; must restore post-brace.
   - **Pilot** orients armor face toward incoming vector (uses existing
     armor-plate directional model).
   - **Captain** decides whether to trust the call or override.
6. Impact resolves — armor absorbs reduced damage, ship enters cooldown.

**Penalty layering (the Goldilocks problem):**

| Layer | Effect | Station bearing the cost |
|---|---|---|
| PDC cooldown | 10–15s reduced PDC tracking quality post-brace | Weapons |
| Maneuvering lockout | Pilot cannot strafe/rotate *during* brace (held heading required) | Pilot |
| Armor heat spike | Brace generates heat in armor system; Eng must coolant-rebalance | Engineering |
| Power debt | Auto-shunt drains reactor; takes ~10s to restore full grid | Engineering |

A false brace eats the full penalty. This is where Weapons' skill ceiling
lives — calling brace correctly under uncertainty.

**Detection split (forced handoff):**
- Signals: long-range salvo detection (5–10s lead time)
- Weapons: PDC close-range tracker (3–5s window for intercept attempt)
- Pilot: not seen until impact alert
- Captain: hears the call, can pre-empt

This split is critical — if Weapons sees missiles first, the Sig→Wep handoff
collapses and Signals loses combat content. Long-range first / close-range
second is the configuration that makes both stations talk.

**Timing window (the whole game depends on this):**
- Under 2s detect-to-impact: solo reflex, no comms — **anti-pattern, do not ship**
- 5–10s: forced verbal handoff, brace decision is deliberative — **target**
- 15s+: brace becomes a routine power-management task, loses tension

Tune missile speed and detection range to land in the 5–10s band.

**Symmetry with offense (move A.2):**

Enemy missiles need a threat class to fire. Player torpedoes already exist.
Enemy ships should run their *own* PDC against player torpedoes — which
gives Weapons a parallel skill ceiling on offense (timing salvos, decoy
patterns, weak-arc shots). The mental model is symmetric:

- Wep tracks enemy **weak vector** (move A.2, scan-revealed) → exploits with torpedoes
- Pilot manages own **armor face** → exposes strong armor to incoming

Same model, both sides of the table.

**Metric impact (single move):**

| Metric | Before | After | How |
|---|---|---|---|
| Edge count | 17 | ~22 | Adds Sig→Wep, Wep→Cap, Wep→Pilot, Wep→Eng, Eng→Wep return |
| Bidirectionality | 0.50 | ~0.80 | Closes Cap↔Wep, Pilot↔Wep, Eng↔Wep return channels |
| Wep out-degree | 1 | 4 | Brace call to Cap, Pilot, Eng + heat to Eng |
| Info locks | 2 | 4 | Per-salvo intercept solution + brace timing both fresh per encounter |
| Handoff edges/trigger (alert) | 2.0 | ~5.0 | Incoming-missile cascade (matches EE alert density) |
| Wep load alignment | 0.14 | ~0.45 | Brace call + tracking is forced verbal output |
| Sig combat coverage | 0.2 | ~0.5 | Salvo detection is genuine combat work |
| Captain leverage | 0.64 | ~0.72 | "Trust the call?" + "pre-brace?" are strong decisions |

**What it does *not* fix:** Signals cruise emptiness, Weapons cruise emptiness
(though PDC calibration drills become natural cruise content), and the
scan/hack mini-game design. PDC+Brace is a combat-phase mechanic; cruise
content from move C still needed.

**Risks to manage:**
- Brace must not become reflex spam — the false-positive penalty must bite.
- The 5–10s timing band is narrow. Playtest the missile speed knob hard.
- Don't surface "incoming missile inbound" auto-alarms on every console —
  that re-creates the auto-push leakage problem. Sig sees it first; the
  rest of the bridge hears it from her voice.
- Brace power-shunt should not be fully automatic if you want Eng to
  participate — recommend Eng-confirmed shunt with a 1s window to override
  for high-skill plays.

### J. Magazine reload as Engineering-gated work

Today `/magazine` is a power-fed system but reload happens passively — Weapons
cycles ammo, magazine fills in the background. Make reload **require active
Engineering allocation**, not just a power flag.

**Mechanic:**
- Magazine has a discrete capacity (N rounds, M torpedoes per tube).
- When depleted, reload requires Engineering to allocate above a threshold of
  power *and* coolant to `/magazine` for a sustained window (10–30s).
- During reload, magazine system runs hot — Eng must coolant-balance against
  Weapons' active firing (chain gun/PDC) and other systems.
- Weapons must **call the empty** — Eng has no console pressure to reload
  unless told. Default state is "no reload happening."

**Why it works:**

- **Closes Wep↔Eng bidirectionality with content.** Today the loop is
  power-down/heat-up. Adding reload makes Wep an active *requester* of Eng
  resource, not just a passive consumer.
- **Pairs with ammo forecast (move B.2).** Wep's "I'll be dry in 90s"
  becomes actionable — Eng can pre-stage the reload before the magazine
  goes empty.
- **Cruise content for both stations.** Reload between fights is the natural
  cruise task. Wep counts inventory and calls; Eng allocates and coolant-
  balances. Two stations with idle 0.1 cruise coverage now have a shared
  task. Phase coverage Wep cruise 0.1→0.4, Eng cruise 0.4→0.5.
- **Captain decision.** "Reload now (vulnerable) or push through (last salvo)?"
  Captain decides; both stations execute. +1 strong decision point.
- **Failure modes are continuous.** Partial reload = partial ammo. Interrupted
  reload by overheat = system damage. Preserves SW's continuous-failure strength.

**Pairs with PDC+Brace (move I):**

The combat tension cycle becomes:
1. Cruise: Wep calls reload, Eng allocates, magazine fills.
2. Combat opens: Wep has full ammo, fires PDC + offense.
3. Mid-fight: Wep ammo runs low, calls forecast.
4. Eng decides — reload now (heat/power cost during fight) or wait.
5. If incoming missile salvo arrives mid-reload, magazine is hot and
   vulnerable. Brace becomes more expensive. Eng must triage.

**Knobs to tune:**
- Reload duration: 15–30s. Shorter = trivial; longer = blocks too much combat.
- Coolant cost: should be enough that Eng cannot reload + power max-fire
  simultaneously. Forces tradeoff.
- Partial reload behavior: ammo per-second feed (continuous) or batch
  (binary)? Continuous preserves failure gradient.

**Metric impact (combined with B.2):**

| Metric | Effect |
|---|---|
| Wep out-degree | +1 (reload requests to Eng) |
| Wep cruise phase coverage | 0.1 → ~0.4 |
| Eng cruise phase coverage | 0.4 → ~0.5 |
| Wep load alignment | further raised toward 0.50 |
| Captain leverage | +1 strong decision (reload timing) |
| Wep↔Eng handoff content | thin (heat only) → thick (heat + reload + power negotiation) |

This is the lowest-cost addition in the expanded plan — the `/magazine`
system already exists in code; the change is making reload conditional on
sustained allocation instead of passive.

### K. Scan and Hack — concrete mechanics

The original third move says "design these with cross-station input." Here's
what that should look like in detail. The two mechanics are paired — scan
gates hack, hack consumes scan — and together they fill Signals' empty
combat phase, produce the per-encounter info locks (A.1, A.2), and create
the offensive Sig→Wep cascade that mirrors the defensive Wep→bridge cascade
of Brace (move I).

#### K.1 Scan — "lock and hold"

Scanning is a **continuous lock** on a single target. Quality accumulates
over time. The longer Signals holds, the more tiers unlock.

| Tier | Time | Requirement | Reveals |
|---|---|---|---|
| 0 | instant | line of sight | faction, rough size class (current behavior) |
| 1 | ~5s | sustained lock | ship class name, primary weapon type |
| 2 | ~15s | + Eng `/signals` power above threshold | **threat ID code (A.1)**, shield/armor profile |
| 3 | ~30s | + Pilot holds ±15° aspect angle | **hull weak vector (A.2)**, ammo/cargo manifest |

**Cross-station inputs:**
- Eng allocates `/signals` power to scan faster (Tier 2+ requires it)
- Pilot must hold a steady aspect angle for Tier 3 (creates Pilot↔Sig handoff
  — current matrix is one-way Sig→Pilot)
- Sustained Tier 3 generates heat in `/signals`; Eng must coolant-balance

**Decay:** Tier drops 1 step when target hard-maneuvers, breaks line of
sight, or enters jamming. **Per-encounter freshness comes from re-scan,
not from re-discovery** — values stay the same for that target until next
encounter.

**Multi-target tension:** Signals can only hold one lock at a time. Captain
decides scan priority. Each new contact resets to Tier 0.

**Output flow (no auto-push):** scan tier color-tints the contact icon on
all radars (existing behavior, OK). The *details* — ID code, weak vector,
manifest — appear only on the Signals console. Voice is the only delivery.

**Cognitive modes added to Signals:** Pattern-matching (reading sensor
profile), Optimizing (which target to deepen), Communicating (calling intel
as tiers unlock), Reacting (decay, target maneuver). Cog variety 1/5 → 4/5.

#### K.2 Hack — "code injection"

Hack is the **offensive use of Signals** — softening enemy systems for
Weapons and Pilot to exploit. Gated by scan: requires Tier 2 on the target
before hack is available.

**Targets (pick one enemy system per attempt):**

| Target | Effect on success | Beneficiary |
|---|---|---|
| Weapons | enemy fire rate −40%, accuracy degraded for 30–60s | reduces incoming → fewer brace events |
| Engines | enemy max speed/turn rate −30% for 30–60s | Pilot exploits, Wep gets easier shots |
| Sensors | enemy fires blind, lock breaks intermittently for 30–60s | Pilot evades, Sig can re-position |
| Reactor | enemy systems flicker (random subsystem dropouts) for 20–40s | Wep can predict gaps |

**Mechanic:**
- Hack progress fills via discrete attempts. Each attempt is a 2–3 second
  code-entry burst — short enough to stay glanceable, not absorbing.
- Continuous failure: closer-to-correct attempts contribute partial progress.
- **Eng coordination beat:** Eng can power-dump `/signals` "on the mark" for
  a 2× progress multiplier on that attempt. Forces a Sig→Eng verbal sync.
- **Pilot range constraint:** further range = harder hack. Pilot affects
  hack feasibility by closing/holding distance.
- **Risk on full failure:** target AI alerts, hard-maneuvers (breaks scan
  tier), hack progress resets.

**Captain decision points added:**
- Which enemy system to hack? (depends on tactical priority)
- Hack the destroyer or the corvette first?
- Eng allocates power to scan, hack, or weapons reload — pick two.

#### K.3 The full offensive cascade

Pairing K.1 + K.2 creates a 6-edge alert/decision cascade across all five
roles, symmetric to the defensive cascade of Brace (move I):

1. Sig: "Scanning destroyer, Tier 2 in 8 seconds" — Eng holds `/signals` power.
2. Sig: "Tier 2 unlocked, threat ID Alpha-Niner-Four" — Wep enters code, lock arms.
3. Sig: "Initiating hack on engines, on my mark…" — Eng readies power dump.
4. Sig: "Mark." — Eng dumps; Sig attempts; Pilot maintains range.
5. Sig: "Engines hacked, 40-second window" — Pilot exploits, Wep targets weak vector.
6. Cap: "Pivot to corvette before window closes."

**6 edges from one trigger.** Defensive Brace cascade fires on incoming
salvos; offensive Scan→Hack cascade fires on engaging a new target. Together
they cover both alert directions — incoming (Brace) and outgoing (Scan/Hack).

#### K.4 Anti-patterns to refuse

- **Auto-painting details on radars.** Color tints OK; ID code, weak vector,
  manifest must be Signals-console-only. Voice is the channel.
- **Long absorbing puzzles.** Code entry must be 2–3 second bursts. The
  Signals officer must always be able to look up and speak.
- **Solo skill ceiling.** Resist making hack a "type fast" mechanic. The
  ceiling lives in *coordination* — when to hack, which system, getting
  Eng/Pilot timed correctly.
- **Permanent intel.** Tier resets per encounter (target re-engagement
  requires re-scan). Hack effects expire. Without decay, the locks become
  session-locks and the recurrence metric collapses back to 2.

#### K.5 Metric impact (combined K.1 + K.2)

| Metric | Before | After |
|---|---|---|
| Sig combat phase coverage | 0.2 | ~0.7 |
| Sig cog variety | 1/5 | 4/5 |
| Sig decision ratio | 0.33 | ~0.65 |
| Sig→Wep edge content | empty (gating only) | ID code + weak vector + hack effects |
| Pilot↔Sig | one-way | bidirectional (aspect-hold gate) |
| Eng↔Sig content | shared `/radar` only | dedicated subsystem + hack power dumps |
| Info locks | 2 (current) | 4–5 (ID code, weak vector, plus per-engagement hack target) |
| Captain leverage | 0.64 | ~0.78 (scan priority, hack target, three-way Eng allocation) |

This is the heaviest move in the plan to build, but it produces the
cognitive-variety and decision-ratio jumps that make Signals a real
station rather than a screen.

### Suggested rollout sequence (build order)

1. **Magazine reload as Eng-gated work** (move J) — smallest code change
   (`/magazine` already exists), proves the active-allocation pattern, gives
   Wep+Eng a cruise-phase shared task immediately.
2. **`/signals` subsystem** (move F) — unblocks Eng↔Sig allocation tradeoff and
   gives the scan mini-game a power/coolant input. Smallest *new* subsystem;
   biggest structural enabler.
3. **PDC + Brace** (move I) — single mechanic that hits five metrics at once;
   the ammo loop from step 1 makes brace's "out of intercepts" failure mode
   meaningful. Build the alert cascade (move E.2 template) on this skeleton.
4. **Threat ID lock** (move A.1) — first offensive per-encounter lock;
   smallest scope to prove the recurrence pattern works on the offense side.
5. **Weapons arc-blocking request** (move B.3) — closes Pilot↔Wep
   bidirectionality on the offense side (Brace closed it on the defense side);
   creates the EE Helms↔Tactical bond without copying EE.
6. **Hit confirmation + ammo forecast** (moves B.1, B.2) — fills Weapons'
   remaining outbound bandwidth; pairs with the reload economy from step 1.
7. **Scan tiers + hull weak vector** (moves K.1, A.2) — second per-encounter
   offensive lock; deepens scan into a multi-tier mechanic with cross-station
   inputs (Eng power, Pilot aspect angle). Proves the offensive cascade pattern.
8. **Hack** (move K.2) — full offensive cascade across all five roles,
   symmetric to the defensive Brace cascade from step 3.
9. **Cruise tasks** (move C) — last, because they depend on the new mechanics
   (reload, calibration, triangulation, scan drills) to have content to drill against.

Each step is independently shippable and individually moves at least one
metric. The cumulative effect closes most of the gap to EE while leaving SW
recognizably itself.
