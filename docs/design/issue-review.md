# GitHub Issues Review

Deep review of all 60 open issues as of 2026-04-14. Categorized with recommendations.

## Summary

| Category | Count | Action |
|----------|-------|--------|
| MS3 Critical Path | 10 | Must do — blocks LARP event |
| Active Bugs | 7 | Triage: fix event-blocking ones, defer rest |
| Blocked (waiting on MS3) | 5 | Will unblock as MS3 progresses |
| Feature Design (stale) | 6 | Review: some absorbed into MS3, some obsolete |
| Good First Issues | 5 | Keep for contributors |
| Quality / Tech Debt | 6 | Nice-to-have, post-event |
| Other Enhancements | 14 | Backlog triage needed |
| Likely Obsolete | 7 | Recommend closing |

**97% of issues are 3+ years old.** Most were filed in mid-2022 during a planning burst. Many describe the world as it was then, not now.

---

## MS3 Critical Path (10 issues)

These directly block the first LARP event. Ordered by dependency chain.

### Dependency Chain 1: Signals
| # | Issue | Status | Dependency |
|---|-------|--------|------------|
| [#1206](https://github.com/starwards/starwards/issues/1206) | Signals jobs system | Core mechanic, designed | Scan levels (built into design) |
| [#1208](https://github.com/starwards/starwards/issues/1208) | Signals station | Station UI, designed | #1206 |

**Assessment:** Well-specified in starwards docs. The signals jobs design (scan/hack/track queue) is detailed and implementable. #1208's checklist is partially done (long-range radar widget exists). This chain is the clearest path forward.

### Dependency Chain 2: Navigation
| # | Issue | Status | Dependency |
|---|-------|--------|------------|
| [#1182](https://github.com/starwards/starwards/issues/1182) | Space highways / warp routes | Core mechanic, designed | None |
| [#1262](https://github.com/starwards/starwards/issues/1262) | Navigator radar widget | UI widget | #1182 |
| [#1261](https://github.com/starwards/starwards/issues/1261) | Navigator station | Station UI | #1262 |

**Assessment:** #1182 is the most technically ambitious item — procedural noise generation, efficiency topology, route optimization. The issue description references an old approach (loading PNG maps from the EE fork). The actual design in docs is much more sophisticated (10 frequencies, procedural generation). **The issue body is outdated and should be rewritten** to match the current design in the starwards docs.

### Dependency Chain 3: Docking & Repair
| # | Issue | Status | Dependency |
|---|-------|--------|------------|
| [#539](https://github.com/starwards/starwards/issues/539) | Ship-in-ship docking | Core mechanic, Done | None |
| [#538](https://github.com/starwards/starwards/issues/538) | Dock master functionality | Station feature, blocked | #539 |
| [#547](https://github.com/starwards/starwards/issues/547) | Repair station | Station, blocked | #1228 (closed?) |

**Assessment:** Docking is mandatory — space stations are ships, players must dock for repairs. The design is solid (compound movement, velocity sync). #547 references a blocker #1228 that may already be closed — needs verification. #538 describes EE-style dock master; the Starwards approach may differ.

### Standalone MS3 Items
| # | Issue | Status | Notes |
|---|-------|--------|-------|
| [#546](https://github.com/starwards/starwards/issues/546) | Multiple ship models | Core content | Need corvette (4-6 crew), cargo ship, space station. Fighters exist. |
| [#1187](https://github.com/starwards/starwards/issues/1187) | Hull damage | Simple mechanic | 2-state (ok/damaged), GM-controlled, for IoT alerts. Quick win. |

**Recommendations:**
1. **Rewrite #1182** body to match current warp topology design
2. **Verify #547's blocker** (#1228) — if closed, unblock it
3. **Prioritize signals chain** (#1206 → #1208) — clearest spec, fewest unknowns
4. **#1187 is a quick win** — simple 2-state model, could ship in a day

---

## Active Bugs (7 issues)

| # | Issue | Age | Event-blocking? |
|---|-------|-----|-----------------|
| [#1847](https://github.com/starwards/starwards/issues/1847) | GM command makes ship un-pilotable | 2 months | **YES** — GM commands are core workflow |
| [#1459](https://github.com/starwards/starwards/issues/1459) | Flaky test: helm assist moveToTarget | 3 years | No — test flake, not gameplay bug |
| [#1434](https://github.com/starwards/starwards/issues/1434) | Flaky test: rotationFromTargetTurnSpeed | 3 years | No — test flake |
| [#1294](https://github.com/starwards/starwards/issues/1294) | Node-RED config node malformed URL | 3.5 years | No — UX polish |
| [#1002](https://github.com/starwards/starwards/issues/1002) | Cannon shells not shown on tactical radar | 4 years | Maybe — weapons officer needs visual feedback |
| [#866](https://github.com/starwards/starwards/issues/866) | Radar damage not reset on ship reset | 4 years | Maybe — affects GM workflow |
| [#745](https://github.com/starwards/starwards/issues/745) | Target view when out of radar range | 4 years | No — edge case |

**Recommendations:**
1. **Fix #1847 now** — only recent bug, blocks core GM workflow
2. **Fix #866** — radar not resetting on ship reset will bite during events
3. **Fix #1002 before event** — weapons officer needs to see their shells
4. **#1459 and #1434** — consider if these still reproduce after 3 years of changes. May be fixed already. Verify and close if so.
5. **#1294 and #745** — low priority, defer

---

## Blocked Issues (5 issues, non-MS3)

| # | Issue | Blocked by | Assessment |
|---|-------|-----------|------------|
| [#1211](https://github.com/starwards/starwards/issues/1211) | Relay station | #1209, #1214 | Part of MS3 chain, will unblock naturally |
| [#1210](https://github.com/starwards/starwards/issues/1210) | Waypoints layers toggle widget | #1214 | Part of relay chain |
| [#1209](https://github.com/starwards/starwards/issues/1209) | Relay radar widget | #1185 | #1185 may be done (waypoints implemented). **Check and unblock.** |
| [#1214](https://github.com/starwards/starwards/issues/1214) | Waypoints layers toggle model | #1185 | Same — **check if #1185 is done** |

**Recommendation:** Verify #1185 status. If waypoints are implemented (they appear to be), #1214 and #1209 can be unblocked, which cascades to unblock #1210 and partially #1211.

---

## Feature Design (Stale) (6 issues)

These are 3-4 year old design sketches. Some have been superseded by the detailed docs written in 2025.

| # | Issue | Assessment |
|---|-------|-----------|
| [#1001](https://github.com/starwards/starwards/issues/1001) | Emissions signature (WIP) | **Keep** — not yet absorbed into MS3 design. Post-event feature. |
| [#969](https://github.com/starwards/starwards/issues/969) | Radar improvements (mega-task draft) | **Superseded** — scan levels design in docs covers this. Close with link to docs. |
| [#967](https://github.com/starwards/starwards/issues/967) | Name ship systems models | **Still relevant** — display names in tweak panel. Quick win. |
| [#882](https://github.com/starwards/starwards/issues/882) | Constants panel for ship model design | **Still relevant** — needed for #546 (multiple ship models). |
| [#870](https://github.com/starwards/starwards/issues/870) | Dynamic map/config/asset loading | **Critical for events** but not MS3. Needed for reusable scenarios. |

**Recommendations:**
1. **Close #969** — superseded by scan levels + signals jobs design
2. **Keep #882 and #870** — both needed, just not on critical path
3. **Label #1001** as `post-event`

---

## Good First Issues (5 issues)

| # | Issue | Still valid? |
|---|-------|-------------|
| [#1294](https://github.com/starwards/starwards/issues/1294) | Node-RED malformed URL | Yes — small validation fix |
| [#958](https://github.com/starwards/starwards/issues/958) | Screen overflow/scrollbars | **Verify** — may be fixed after 4 years of UI work |
| [#896](https://github.com/starwards/starwards/issues/896) | Add space object properties to tweak panel | **Verify** — tweak panel has changed significantly |
| [#881](https://github.com/starwards/starwards/issues/881) | Collapsible side pane | **Verify** — UI layout may have changed |
| [#853](https://github.com/starwards/starwards/issues/853) | Multi-ship move order broken | Yes — GM workflow issue |

**Recommendation:** Verify #958, #896, and #881 still reproduce. These are 4 years old and the UI has been substantially reworked. Close any that are fixed.

---

## Quality / Tech Debt (6 issues)

| # | Issue | Priority |
|---|-------|----------|
| [#1018](https://github.com/starwards/starwards/issues/1018) | Use logger instead of console | Low — nice for debugging but not blocking |
| [#856](https://github.com/starwards/starwards/issues/856) | Pathfinding for bot "move" | Medium — dumb bots look bad during events |
| [#843](https://github.com/starwards/starwards/issues/843) | Use RTuple2/Tuple2 types | Low — code consistency |
| [#842](https://github.com/starwards/starwards/issues/842) | Improve explosion damage angle test | Low — test quality |
| [#805](https://github.com/starwards/starwards/issues/805) | Clean up thruster velocity capacity | Low — code quality |
| [#788](https://github.com/starwards/starwards/issues/788) | QA armor behavior | Medium — armor is core; should verify before event |
| [#748](https://github.com/starwards/starwards/issues/748) | Cleanup old rooms on game close | Medium — affects GM workflow during events |

**Recommendations:**
1. **#788 (QA armor)** — do before event. Armor is core combat mechanic.
2. **#748 (cleanup rooms)** — fix before event. Stale rooms during multi-hour LARP = confusion.
3. **#856 (pathfinding)** — nice to have. NPCs walking through asteroids looks bad.
4. Rest can wait.

---

## Other Enhancements (14 issues)

| # | Issue | Keep/Close |
|---|-------|-----------|
| [#1846](https://github.com/starwards/starwards/issues/1846) | Shortcut tips | Keep — UX for new players |
| [#1576](https://github.com/starwards/starwards/issues/1576) | Tweakpane non-interactive number range | Keep — better than abusing sliders |
| [#1239](https://github.com/starwards/starwards/issues/1239) | Composition over inheritance in ship-state | Keep — architectural improvement |
| [#1238](https://github.com/starwards/starwards/issues/1238) | Manage ship room lifecycle | **Important** — open/close rooms explicitly, clean up on ship destruction |
| [#1233](https://github.com/starwards/starwards/issues/1233) | Broken status in damage report | Keep — ECR needs this for event play |
| [#1188](https://github.com/starwards/starwards/issues/1188) | Nebula | Keep — environmental variety |
| [#968](https://github.com/starwards/starwards/issues/968) | Armor adjustments | Keep — ties to #788 QA |
| [#895](https://github.com/starwards/starwards/issues/895) | Retire PropertyPanel | **Verify** — may be done or irrelevant now |
| [#878](https://github.com/starwards/starwards/issues/878) | Ship log | Keep — useful for events |
| [#863](https://github.com/starwards/starwards/issues/863) | Optimize collisions (isStatic) | Keep — performance |
| [#835](https://github.com/starwards/starwards/issues/835) | Usage instructions | **Important for events** — players need onboarding docs |
| [#834](https://github.com/starwards/starwards/issues/834) | Keys configuration | Keep — different events may need different keybinds |
| [#833](https://github.com/starwards/starwards/issues/833) | Armor plates on tactical radar | Keep — combined view for single-pilot |
| [#551](https://github.com/starwards/starwards/issues/551) | AI handicap variables | Keep — GM needs difficulty tuning |
| [#548](https://github.com/starwards/starwards/issues/548) | Cargo system | Keep — explicitly deferred post-event |

---

## Likely Obsolete (7 issues) — Recommend Closing

| # | Issue | Reason to close |
|---|-------|----------------|
| [#12](https://github.com/starwards/starwards/issues/12) | Inspiration list | **7 years old.** Single link to F-35 UI video. Not actionable. |
| [#37](https://github.com/starwards/starwards/issues/37) | Tactical dogfight features | **5 years old.** Wishlist from before the damage system existed. Most items either done or superseded by the three-circle weapon design. |
| [#766](https://github.com/starwards/starwards/issues/766) | Learn from babylon.js demo | **Obsolete.** 3D view was removed (Decision #002). Babylon.js is no longer relevant. |
| [#545](https://github.com/starwards/starwards/issues/545) | Fighters in-station repair | **Hebrew text, vague.** Superseded by repair station (#547) and repair system design in docs. |
| [#543](https://github.com/starwards/starwards/issues/543) | Fighters field repair | **One-liner.** Superseded by repair system design (3-tier repair in docs). |
| [#549](https://github.com/starwards/starwards/issues/549) | Collection of damaged ships | **Vague.** "Options like tractor beam or harpoon" — no spec, no context. If still wanted, rewrite as a proper feature request. |
| [#551](https://github.com/starwards/starwards/issues/551) | AI handicap variables | Actually still relevant — keep this one. Moved to Other Enhancements above. |

**Revised close list: #12, #37, #766, #545, #543, #549** (6 issues).

---

## Recommended Actions

### Immediate (this week)
1. **Fix #1847** — GM command breaks pilotability. Only recent bug. Blocks event prep.
2. **Close 6 obsolete issues** (#12, #37, #766, #545, #543, #549)
3. **Verify blockers:** Check if #1185 is done → unblock #1209, #1214 → cascades to #1210, #1211
4. **Verify #547 blocker** (#1228) — if closed, unblock repair station

### Before next sprint
5. **Rewrite #1182** body — current description references PNG map loading from EE fork, actual design is procedural warp topology
6. **Verify stale bugs** (#1459, #1434, #958, #881, #896, #895) — run them against current code, close any that no longer reproduce
7. **Label issues for event priority:** add a `pre-event` label for items that must ship before the LARP

### Pre-event must-fix (beyond MS3)
8. **#866** — radar damage not reset on ship reset
9. **#1002** — cannon shells not shown on radar
10. **#748** — cleanup rooms when game closes
11. **#788** — QA armor behavior
12. **#835** — write usage instructions
13. **#1233** — broken status in damage report widget
14. **#1238** — manage ship room lifecycle

### Post-event backlog
Everything else. Consider a backlog grooming session to close or consolidate the remaining 3-4 year old issues that haven't seen activity.
