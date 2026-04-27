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
