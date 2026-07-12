# Damage Model, Design Specification

> **Status: design document.** This is the agreed target design for the armor x ammo damage
> model, written to replan [PR #1932](https://github.com/starwards/starwards/pull/1932) /
> [#1929](https://github.com/starwards/starwards/issues/1929). Nothing here is final or fully
> implemented: the PR contains an earlier iteration, and the impact delivery mechanism is being
> built separately. Decision records [006](../decisions/006-damage-profile-unification.md)-[011](../decisions/011-armor-table-rebalance.md)
> hold the historical rationale; where they conflict with this document, this document wins.

## 1. The model at a glance

A weapon hit is resolved in four steps, each governed by data (no special-case code per weapon):

1. **Delivery**: how the damage arrives. A physical hit (**impact**) or a blast area
   (**explosion**). Property of the round.
2. **Armor engagement**: the target's armor model reacts to the round's **damage type** using
   two numbers (`plateDamage`, `penetration`). Decides how much reaches the ship.
3. **Channels**: damage that gets past armor goes to systems through the **penetration
   channel**; blast/shrapnel weapons additionally scrape hull-mounted systems through the
   **surface channel**, armor or no armor.
4. **System damage**: affected systems take **defect rolls**; each success inflicts one small,
   fixed-size malfunction (never instant destruction: malfunction over destruction).

Every knob below lives in data files, so balance is tunable without code changes.

## 2. Damage types

**General explanation:** every round carries one of five damage types. The type determines the
damage profile (how systems are affected) and which row of the armor table applies. The type is
a property of the warhead, so the ClusterMissile switches type with its selected mode.

**Terms:**

- **Damage type**: the family a round belongs to, what kind of harm it does.
- **Damage profile**: the per-type behavior bundle defined in sections 3-5 (scope, layer,
  factors, surface behavior).

| Type | Fiction | Short version |
| --- | --- | --- |
| HiExp | high-explosive blast wave | breaches armor over time, washes the deck |
| ArmPen | kinetic penetrator (sabot) | punches one deep channel, nothing outside |
| Frag | shrapnel cloud | shreds hull-mounted equipment, cannot get inside |
| Tandem | tandem shaped charge (HEAT) | slightly weaker ArmPen that defeats reactive armor |
| Elec | EMP discharge | hits electronics wherever they are mounted |

## 3. Delivery: impact, explosion, pierce (TBA)

**General explanation:** delivery answers how the damage arrives at the ship. It is a flag on
the warhead (per cluster mode, not per missile). The two deliveries produce damage events very
differently, so most mechanics in this document belong to one side or the other.

**Terms:**

- **Damage event**: one application of damage to one ship. An amount, a surface arc, and a
  damage type. Everything downstream (armor, channels, rolls) consumes damage events.
- **Impact**: the round must **physically hit the ship** (contact fuze; no proximity
  detonation; it can be dodged or shot down). A hit produces **exactly one damage event** at the
  contact point: narrow arc, so one armor plate and one ship area. The event's amount is the
  round's **damage** number.
- **Explosion**: the round detonates into a blast object that grows over time. Every game tick
  (60/s) it overlaps a ship produces one damage event with amount
  `damageFactor x tickSeconds x overlap`. Big, lingering blasts therefore deliver **many small
  events**; wide blasts can cover both ship areas and several ships at once.
- **Blast size**: the explosion's maximum radius, `expansionSpeed x secondsToLive`. Its
  `secondsToLive` is also how long the danger zone persists (ships can fly into it).
- **Knockback**: explosions also shove the target (`blastFactor`). Not a damage number.
- **Pierce (TBA)**: reserved future delivery for the railgun. Overpenetration, a line through
  the ship that can damage systems in both areas along its path. Not designed yet.

| Delivery | Trigger | Events per round | Arc | Dodgeable | Used by |
| --- | --- | --- | --- | --- | --- |
| Impact | contact only | exactly 1 | one plate, one area | yes | ArmPenShell, ArmPenMissile, TandemMissile, Cluster-AP mode, ElecMissile |
| Explosion | detonation (proximity for missiles, contact/range for shells) | one per tick while overlapping | grows with blast, can span areas/ships | only by distance | HiExpShell, HiExpMissile, FragShell, FragMissile, Cluster-Frag mode |
| Pierce | TBA | TBA | line across areas | TBA | future railgun |

A future **EMP-explosion** variant (area denial, several ships at once) is possible; the model
supports it. Today's ElecMissile is deliberately impact (see section 8).

## 4. System damage: rolls, defects, concentration, sticky victim, cooldown

**General explanation:** systems are never destroyed in one blow. Each damage event gives the
affected systems **defect rolls**; each successful roll causes one **defect**, a small,
fixed-size malfunction specific to that system (an aim offset, a capacity loss, and so on).
Enough defects eventually make a system `broken`. How many rolls a target gets, who the target
is, and how often a system can be hurt are the three mechanics below.

**Terms:**

- **Defect roll**: a probability check. Chance = `cdf(event amount x factors)` against the
  system's `damage50` (the amount at which a roll is a coin flip). Strong hits are near-certain,
  weak hits are rare. One success = one defect, always the same size. A stronger hit raises the
  chance, not the defect size.
- **Defect**: one fixed-size malfunction step (per-system effects table in section 7).
- **Concentration**: **how many defect rolls the target receives per damage event.** A
  property of the round (own column in the ammo tables, section 8). Default 1. High
  concentration means the round dumps its energy into its victim: an 8-concentration hit gives
  its victim 8 rolls at once.
- **Sticky victim**: for `single`-scope rounds only. The victim system is picked **once per
  projectile** (randomly, but deterministically from the projectile's id) and every roll from
  that projectile lands on it. One rod, one victim. Multi-scope rounds have no victim to pick;
  everyone in the area rolls.
- **Defect cooldown**: **explosion delivery only.** A system accepts at most one damage-event
  application per cooldown window (**0.15s** baseline, tunable). Without it, a blast overlapping
  at 60 ticks/s would flood a breached section with ~20 defects per missile; with it, a full
  HiExp missile engulfment lands ~2-3 defects per system. Impact needs no cooldown: one event
  per round, and its rate limit is the weapon's rate of fire.

| Mechanic | Applies to | Effect |
| --- | --- | --- |
| Concentration | every round (default 1) | rolls per target per damage event |
| Sticky victim | `single` scope only | all of a projectile's rolls hit the same system |
| Defect cooldown | explosion delivery only | max one application per system per 0.15s |

**Resulting doctrine:** one HE = everything in the section bleeds; one AP = one system dies.

## 5. Scope and layer: which systems are affected

**General explanation:** when damage gets past armor (section 6), the round's profile decides
which systems roll. Two independent properties: **scope** (how wide) and **layer** (internal or
external). A strict rule ties them together: rounds whose penetrating damage reaches internal
systems can never full-force damage externals. Externals are touched only by the surface
channel.

**Terms:**

- **Scope**: `single` = one system (the sticky victim). `multi` = every matching system in the
  hit area. `electronics` = every electronics system **ship-wide**, ignoring the hit arc; the
  discharge travels the ship's grid.
- **Layer (`hitsInternal`)**: `internal` = the penetrating damage reaches internally-mounted
  systems only. `external` = hull-mounted systems only (Frag: shrapnel cannot get inside).
- **Surface channel (scrape)**: HiExp and Frag damage hull-mounted systems in the arc on
  **every hit, regardless of armor**, because the equipment sits outside the plates. Strength =
  `amount x 0.05 x surfaceDamageFactor` (Frag 2, a purpose-built shredder; HiExp 0.25, a wash).
- **Deflectable**: a deflecting armor (Reactive) pushes the round away before its blast
  develops, cancelling the scrape. **Everything is deflectable except Tandem** (its precursor
  defeats the deflection) **and Frag** (a cloud is not a round, there is nothing to push away).
- **System damage factor**: multiplier on the penetrating channel's roll amounts (for example
  ArmPen x1.5 concentrated punch, Elec x2).

| Type | Scope | Layer | Factor | Scrape | Deflectable |
| --- | --- | --- | --- | --- | --- |
| HiExp | multi | internal | 1 | yes x0.25 | yes |
| ArmPen | single | internal | 1.5 | no | yes |
| Frag | multi | external | 0.5 | yes x2 | **no** |
| Tandem | single | internal | 1 | no | **no** |
| Elec | electronics | (all electronics) | 2 | no | yes |

Exception to memorize: Cluster-AP mode is ArmPen-type but **multi**. The carrier penetrates
and its bomblets pepper every internal system in the struck area (section 8).

## 6. Armor

**General explanation:** a ship wears one armor model, a ring of plates, each with its own
health, absorbing hits by angle. Per damage type, the model declares two numbers that fully
describe the engagement. Both apply identically to impact and explosion events.

**Terms:**

- **`plateDamage`**: multiplier on **plate erosion only**, never on system damage (armor
  decides time to breach, not post-breach pain). `0` = the armor does not engage this type at
  all. Scale: 0 immune, 0.25/0.5 resistant, 1 normal, 2 vulnerable; anything between is legal,
  per model, data-only.
- **`penetration`**: fraction (0..1) of system damage that bypasses **intact** plates. On a
  non-engaging hit (`plateDamage 0`), `penetration >= 1` means the armor is transparent.
- **Exposure**: how open a hit arc is, `max(penetration, brokenPlateRatio)`. Scales the
  penetrating channel's roll amounts. Broken plates are the hole damage flows through.
- **Single-use cells (`singleUsePlates`)**: Reactive. An engaging hit **pops** the cells in the
  arc (they go to zero and never heal) and is **defeated** (exposure is measured before the
  pop). Follow-up hits on the bared section get through. Every defeated warhead costs a cell:
  sustained cheap fire strips ERA.
- **`deflectsSurfaceEffect`**: Reactive only. Cancels the scrape of deflectable types.

Cell values below are `plateDamage / penetration`:

| vs | Composite | Whipple | Hardened | Reactive | Faraday |
| --- | --- | --- | --- | --- | --- |
| HiExp | 1 / 0 | 0.25 / 0 | 0.5 / 0 | 1 / 0 pop | 0 / 1 |
| ArmPen | **2 / 0** | **0 / 1** | 1 / 0 | 1 / 0 pop | 0 / 1 |
| Frag | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 (no pop) | 0 / 0 |
| Tandem | 1 / 0 | **0 / 0** | **2 / 0** | **1 / 1** pop | 0 / 1 |
| Elec | 0 / 1 | 0 / 1 | 0 / 1 | 1 / 0 pop | **0 / 0** |

**Armor identities:**

| Model | One-liner | Nightmare | Specialty |
| --- | --- | --- | --- |
| Composite | the baseline hull layer | ArmPen (2x) | no walls, no gaps |
| Whipple | standoff screen | ArmPen ignores it (0/1) | blunts blast, pre-detonates shaped charges |
| Hardened | thick slab | Tandem jet (2x) | the only armor that stops kinetic rounds |
| Reactive | one-shot cells | Tandem (pop + full force); attrition | defeats every warhead once per cell; blocks Elec; deflects HiExp scrape |
| Faraday | EM cage | any physical round (transparent) | kills Elec; Frag still can't penetrate it |

Frag interacts with no armor at all: its row is 0/0 everywhere and it never activates ERA; its
entire output is the surface scrape, which no armor (deflection included) stops.
`withFaradayLayer(model)` overlays Elec-blocking on any other model.

## 7. Ship systems: classification and defects

**General explanation:** systems are classified by mounting (**internal**/**external**, which
decides scrape eligibility and which layer penetrating damage reaches) and by nature
(**electronics**, which decides Elec targeting). Classification is per system class today;
per-ship mounting is future work ([#1954](https://github.com/starwards/starwards/issues/1954)).
Each defect applies that system's own small malfunction.

| System | Mounting | Electronics | One defect does |
| --- | --- | --- | --- |
| Thrusters | external | no | angle error 1-3 degrees or capacity -0.01..0.1 |
| Chain gun / tubes | external | yes | aim offset 1-2 degrees or rate-of-fire x0.9 |
| Radar | external | yes | malfunction range +5% |
| Docking | external | yes | ranges -5% |
| Signals | external | yes | job speed -5% or success -5% |
| Reactor | internal | yes | energy x0.9 or efficiency -5% |
| Magazine | internal | yes | lose ~10% of one ammo stock or capacity x0.9 |
| Warp | internal | yes | damage factor +0.05 or velocity x0.9 |
| Maneuvering | internal | no | efficiency -5% or afterburner fuel x0.9 |
| Smart pilot | internal | yes | aim offset +0.01 |

Breaking a system takes roughly 10-20 defects (varies per system); repair is ECR gameplay.

## 8. Ammo catalog

**General explanation:** nine ammo types (three chain-gun shells, six missiles; the
ClusterMissile is one magazine slot with two selectable warhead modes; the tube chooses the
mode, switchable until detonation). **Concentration** column = defect rolls per damage event
(section 4). **Sticky** = single-scope victim locking. Impact rounds carry a flat **damage**
number; explosion rounds carry a per-tick `damageFactor` plus blast size/linger. All damage
numbers are proposed values pending playtest.

**Warhead table:**

| Ammo | Type | Delivery | Scope | Sticky | Concentration | Damage | Blast |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HiExpShell | HiExp | explosion | multi | no | 1 | 20/tick | 200m x 1s |
| ArmPenShell | ArmPen | impact | single | per shell | **1** | 30 | none |
| FragShell | Frag | explosion | multi ext. | no | 1 | 10/tick | 250m x 1s |
| HiExpMissile | HiExp | explosion | multi | no | 1 | 50/tick | 350m x 0.35s |
| ArmPenMissile | ArmPen | impact | single | yes | **8** | 60 | none |
| FragMissile | Frag | explosion | multi ext. | no | 1 | 10/tick | 800m x 1.6s |
| Cluster, Frag mode | Frag | explosion | multi ext. | no | 1 | 10/tick | 750m x 1s |
| Cluster, AP mode | ArmPen | impact | **multi** | no | **3** | 30 | none |
| TandemMissile | Tandem | impact | single | yes | **5** | 50 | none |
| ElecMissile | Elec | impact | electronics | no | 1 | 25 | none |

Reading the concentration column: the ArmPen missile is the assassin, 8 near-certain rolls
into one system per hit. Tandem is its slightly weaker sibling (5) whose value is the armor
matchups. Cluster-AP peppers every internal in the area with 3 rolls each. The ArmPen
**shell** is concentration 1 on purpose: its power is anti-armor (plate erosion at 2x vs
Composite), you get hit by 10-20 in a row, and their system damage stays occasional jabs.
All frag warheads share one intensity (10/tick) and differ only by cloud size and linger; the
dedicated FragMissile out-clouds the cluster's frag mode on both.

**Missile flight table** (explosion missiles detonate at 100m proximity; impact missiles are
contact-fuzed and can be dodged):

| Missile | Max speed | Turn rate | Flight time | Fuze |
| --- | --- | --- | --- | --- |
| HiExpMissile | 600 | 720 deg/s | 78s | proximity |
| ArmPenMissile | 960 | 504 deg/s | 42s | **contact** |
| FragMissile | 600 | 720 deg/s | 78s | proximity |
| ClusterMissile | 600 | 720 deg/s | 78s | by mode: Frag proximity / AP **contact** |
| TandemMissile | 420 | 936 deg/s | 60s | **contact** |
| ElecMissile | 780 | 720 deg/s | 96s | **contact** |

Shells: 5 heat per shot; missiles: 25. Dragonfly magazine: 2400 / 1200 / 2000 shells,
12 / 6 / 8 / 6 / 4 / 4 missiles (HiExp / ArmPen / Frag / Cluster / Tandem / Elec).

## 9. Worked examples

**ArmPen missile vs intact Composite:** contact, one event, amount 60. Armor row 2/0: the
struck plate erodes 120; exposure 0 (plates intact, no penetration), so **no system damage**.
Armor did its job; repeat hits break the plate, then the assassin gets in.

**ArmPen missile vs breached Composite section:** exposure 1, sticky victim picked, 8 rolls x
`cdf(60 x 1.5)` which is near-certain, so **~8 defects into one system**: crippled or broken.
Everything else in the section: untouched.

**HiExp missile vs the same breach:** ~21 explosion events over 0.35s, cooldown rations to
~2-3 applications per system, so **every internal in the section takes ~2-3 defects**, plus the
externals take the (weak, x0.25) scrape. Whole section bleeds; ECR triage.

**Frag missile vs anyone:** armor row 0/0 everywhere. Plates never touched, ERA never wakes.
The 800m cloud lingers 1.6s; every external in the arc takes rationed scrape rolls at x2:
**thrusters, radar, guns get sanded no matter what armor the ship wears.** Counters: distance
and repair, not armor.

**ElecMissile vs Reactive:** contact, armor row 1/0 pop: a cell dies, the dart is defeated,
**electronics safe, one cell spent**. Same missile vs Composite: 0/1 transparent, so every
electronics system ship-wide rolls once at x2.

## 10. Tuning knobs

| Knob | Where | Governs |
| --- | --- | --- |
| armor rows (`plateDamage_*`, `penetration_*`, flags) | `configurations/armor-models.ts` | every armor x type matchup |
| profile scope/layer/factors, scrape strengths, deflectable | `space/damage-profile.ts` | per-type behavior |
| per-round: delivery, damage, concentration, blast, homing, heat | `space/projectile.ts` | every ammo number |
| scrape constant (0.05) | `ship/damage-manager.ts` | global scrape calibration |
| defect cooldown (0.15s) | `ship/damage-manager.ts` | explosion flood rationing |
| `damage50`, defect sizes | per-system designs | system toughness |

Regression pins in `modules/core/test/` restate the whole design as assertions; every tuning
change is a deliberate pin update.

## 11. Future and open items

1. **Replan PR #1932 around this document**: impact delivery (Amir, in progress),
   concentration + sticky victim, explosion defect cooldown; then retune damage numbers.
2. **Pierce delivery**: the railgun's overpenetration line. Reserved, not designed.
3. **EMP-explosion variant**: area-denial EMP (multi-ship) as a future GM tool or mine; the
   delivery flag supports it without new mechanics.
4. **Play-test calibration**: all damage numbers, concentration values, cooldown length, frag
   scrape rates, Hardened grind pace, Reactive attrition pace.
5. **Weapons-station UI**: cluster mode toggle on the tube widget (state/commands exist).
6. **Per-ship system mounting**: [#1954](https://github.com/starwards/starwards/issues/1954).
7. **Ammo widget grouping**: 9 flat rows may read poorly at the weapons station.
8. **Tandem surface realism**: real shaped charges also blast on contact; currently zero
   surface effect for role clarity. A token deflectable scrape is a two-number change if wanted.
