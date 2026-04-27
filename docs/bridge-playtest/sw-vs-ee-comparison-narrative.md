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

## Three Moves That Would Fix Most of This

**Add a per-fight number that lives at Signals and matters to Weapons.** The mechanic doesn't have to copy EE's frequency dial. It could be a weakness scanning reveals, a decryption code, an enemy thrust signature — anything where every encounter generates a fresh discrete value that one station must discover and another must use, with the handoff happening through speech rather than an auto-applied display. This single addition would simultaneously give Signals a reason to exist in combat, a reason to talk, and a reason for Weapons to listen.

**Give Weapons something to broadcast.** Hit confirmations, ammo state, weapon readiness, target damage estimates — anything the rest of the bridge can't see and would benefit from knowing. The exact content matters less than the principle: weapons should be a node that produces information, not just consumes it.

**Don't build scan and hack as solo puzzles.** When the Signals mini-games arrive, design them with cross-station inputs. Make scanning faster when the pilot holds a specific range. Make hacking depend on power allocation from engineering. Make scan results decay so they need ongoing attention. Anything that turns these from self-contained puzzles into bridge-wide collaborative tasks. The temptation to ship them as tight standalone challenges should be resisted — that's how EE got its comms-island problem, and the same shape would do more damage in a bridge that already has under-talking stations.
