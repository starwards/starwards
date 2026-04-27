# SW vs EE — Bridge Comparison for Designers

A plain-language read on how Starwards' current bridge feels compared to EmptyEpsilon, across five crew roles: pilot, weapons, engineering, signals (EE calls this "operations"), and captain.

For the data this is built on, see [`sw-vs-ee-comparison.md`](sw-vs-ee-comparison.md) and the per-game reports in [`sw-metrics-report.md`](sw-metrics-report.md) and [`ee-reference/ee-metrics-report.md`](ee-reference/ee-metrics-report.md).

## The Headline

EmptyEpsilon's bridge is denser. Starwards has fewer reasons for the crew to talk. Two stations — Signals and Weapons — barely participate in the conversation that makes a bridge sim a bridge sim. EmptyEpsilon has its own problems (Operations is overloaded; combat hacking creates a dead-air pocket), but the connective tissue between roles is much stronger over there. Starwards isn't worse everywhere — several mechanics are sharper. But the *who-talks-to-whom* structure has gaps that translate directly into players sitting in silence or working alone.

## What Starwards Does Better

**Flying actually rewards skill.** The Newtonian flight model gives the pilot a deeper ceiling than EE, where the helm officer mostly types in headings and warp levels. A good pilot in Starwards has expressive work to do; a good helm officer in EE has fewer places to express it.

**Failure is graceful.** Most Starwards actions degrade smoothly — partial hits do partial damage, power tradeoffs are continuous knobs, brakes give you a curve to ride. EE's scanning and hacking are pass/fail puzzles where a wrong answer stops you cold. Continuous failure makes effort feel rewarded even when execution is imperfect. Don't lose this when scan and hack mini-games get designed.

**Nobody goes silent.** Every Starwards station can keep talking while it works. EE's hacking traps the operator in a focused mini-game where they can't really converse — a comms island forms during one of the most tactically charged moments of play. Starwards has nothing like this yet, and shouldn't add it.

**Less backdoor data-sharing.** Both games leak information through automatic displays, but EE has more of these small bypasses. The one exception worth watching: when Signals scans a contact, the identification auto-applies to every radar with nobody having to speak. As scan and hack grow, this kind of automatic propagation is the easiest way to accidentally erode the verbal channel.

## Where the Bridge Falls Apart

**Signals is hollow.** The signals officer watches a long-range radar, cycles through targets, and has essentially nothing else to do. They absorb the picture but have no way to act on it, no exclusive information they must speak aloud for the crew to use, and no real combat role at all. A station that produces neither actions nor speech isn't a role — it's a screen the player happens to be sitting in front of. This is the single biggest problem.

**Weapons is a sink, not a participant.** The weapons officer receives orders, receives power, receives targeting info, fires, and produces nothing the rest of the bridge needs to know. In EE, weapons constantly negotiates with helm ("hold this heading, my arc is on it") and operations ("what's their shield frequency?"). In Starwards, weapons works alone in silence. This is the kind of role players consistently report as unsatisfying — it feels like running a sub-app, not crewing a ship.

**Nothing forces fresh information per fight.** EE does one specific thing brilliantly: every encounter generates a new enemy shield frequency that must be discovered, spoken aloud, and dialed in. Tiny mechanic, outsized effect — every combat opens with a forced verbal handoff. Starwards has no equivalent. Its few information dependencies fire once per session and then stay fixed. The bridge has no recurring reason to pass critical data back and forth, which is exactly the texture players come to a bridge sim for.

**Conversation only flows downhill.** Half the role pairs in Starwards are one-way streets. Engineering tells Signals what its power level is, but Signals feeds nothing back. The captain orders Weapons, but Weapons reports nothing back. The pilot's heading matters to Weapons, but Weapons never asks for an adjustment. EE has roughly twice as many two-way relationships, which is why its bridge feels like a conversation and Starwards' often feels like a broadcast.

**Cruise phase has two empty chairs.** Between combat encounters, both Signals and Weapons sit near-idle. Half the console stations are doing nothing while the ship moves between events. EE has a similar problem with engineering during cruise, but Starwards doubling it means the dead air is much more visible at the table.

**The captain has fewer levers.** A captain influences play through orders that actually shift outcomes. Starwards has fewer such moments than EE — partly because scan, hack, and repair aren't built yet, partly because the crew has fewer interesting choices to influence in the first place. The captain ends up with a shorter menu of meaningful calls.

## What Would Actually Fix It

The full plan is in the data doc. The shape of it, in plain language:

**Add a per-fight number that lives at Signals and matters to Weapons.** Not a copy of EE's frequency dial — a weakness scanning reveals, a hull weak vector, an enemy reactor signature. Every encounter generates a fresh value one station must discover and another must use, handed off by voice. This alone gives Signals a reason to exist in combat, a reason to talk, and a reason for Weapons to listen. Stack two or three of these rather than one heavy mechanic.

**Make Weapons defend the ship, not just attack it.** A point-defense cannon — successor to EE's beams — that doubles as a missile interceptor. When the PDC saturates, the weapons officer calls "BRACE." The crew commits: engineering shunts power to armor, the pilot orients the armor face toward the threat, the captain decides whether to trust the call. False braces still eat the cooldown, so calling correctly under uncertainty becomes a real Weapons skill. This single mechanic gives Weapons an outbound voice, a reason to hear from Signals (long-range salvo detection), a reason to need the pilot, and a reason to negotiate with engineering. The rhythm of an EE bridge under attack — a forced verbal cascade across stations — finally exists.

**Make magazines need engineering.** Today reload happens passively in the background. Make it a deliberate Engineering allocation — power and coolant for fifteen-to-thirty seconds — that has to be requested and timed. Suddenly Weapons and Engineering have a shared task during cruise (the dead-air phase), a real captain decision in combat ("reload now, vulnerable, or push through with the last salvo?"), and a tighter coupling around the heat budget. The lowest-cost addition in the plan, because the magazine system already exists in code.

**Give Engineering a Signals dial of its own.** Today scanning shares power with the pilot and weapons radars — they all rise and fall together, so engineering can't really make a Signals tradeoff. Splitting `/signals` into its own subsystem unlocks that tradeoff and makes the upcoming scan mini-game answerable to engineering's allocation, not just the player at the Signals seat.

**Build scan as a lock-and-hold, not a puzzle.** Signals locks onto a target and holds. Tiers unlock with time: faction at a glance, ship class after a few seconds, threat ID code with engineering's power behind it, hull weak vector when the pilot holds a steady aspect angle. Hard maneuvers and broken sight lines drop the tier. The details live on the Signals console only — color tints can show on other radars, but the ID code and the weak vector are voiced or they don't exist. This single shape gives Signals four cognitive modes instead of one (pattern-matching, optimizing, communicating, reacting), turns the pilot-signals relationship two-way, and produces the per-fight numbers that Weapons needs.

**Build hack as a coordination beat, not a typing test.** Once a target is scanned deep enough, hack becomes available — soften enemy weapons, engines, sensors, or reactor for thirty to sixty seconds. The action is short two-or-three-second code bursts, never absorbing. The skill lives in the *coordination*: engineering can power-dump on the mark for a multiplier, the pilot has to hold range, the captain picks which enemy system softens which of our problems. A successful hack is the Signals→Weapons→Pilot offensive cascade — the mirror of the Brace cascade running the other direction. Resist the temptation to make hack a fast-typing mini-game; that's how EE got its comms islands. The skill ceiling here is *when and what*, not *how fast*.

**Build it in this order.** Magazine reload first — it's the cheapest change and gives both quiet stations something to do during cruise. Then the dedicated Signals subsystem, then PDC and Brace, then the per-fight scanning numbers. Each step ships independently and moves at least one metric. The cumulative effect closes most of the gap to EE while leaving Starwards recognizably itself.
