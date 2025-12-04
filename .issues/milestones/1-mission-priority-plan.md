# Mission in the Fringe - Priority Plan

Generated: 2025-12-04

## Milestone Overview
- **Progress**: 36/62 closed (58%)
- **Open**: 26 issues
- **Blocked**: 5 issues marked, but 5 more are actually unblocked now (blockers recently closed)

---

## Key Finding: Recently Unblocked Issues

These issues are marked as blocked but their blockers are now **closed**:

| Issue | Title | Was Blocked By |
|-------|-------|----------------|
| #1214 | waypoints layers toggle model | #1185 (CLOSED) |
| #1209 | relay radar widget | #1185 (CLOSED) |
| #1206 | signals jobs system | #1205 (CLOSED) |
| #547 | repair station | #1228 (CLOSED) |
| #1182 | space highways/warp routes | #1180, #1446 (CLOSED) |

---

## Priority Recommendations (Risk-Optimized)

### TIER 1: Critical Unblocking Path (High Value, Low-Medium Risk)
These unblock the most downstream issues:

| Priority | Issue | Why | Unblocks | Complexity |
|----------|-------|-----|----------|------------|
| **1** | #1214 | Simple client-side store | #1210 → #1211 (relay station) | Low |
| **2** | #1204 | Radar based on tactical radar | #1208 (signals station) | Medium |
| **3** | #1206 | Now unblocked by #1205 | #1208 (signals station) | Medium |
| **4** | #1209 | Now unblocked by #1185 | #1211 (relay station) | Medium |
| **5** | #1262 | Radar widget | #1261 (navigator station) | Low-Medium |

### TIER 2: Quick Wins (Low Risk, Fast Delivery)

| Priority | Issue | Why | Complexity |
|----------|-------|-----|------------|
| **6** | #1187 | Simple 2-state flag, GM-controlled | Very Low |
| **7** | #1233 | Small UI enhancement | Low |
| **8** | #788 | QA/testing - validates armor system | Low |

### TIER 3: Medium Risk (Well-Defined Work)

| Priority | Issue | Why | Notes |
|----------|-------|-----|-------|
| **9** | #1238 | 50% done (2/4 items) | Core lifecycle management |
| **10** | #551 | AI tuning parameters | Gameplay balance |
| **11** | #968 | Armor system adjustments | Core game logic |
| **12** | #539 | Ship-in-ship docking | Unblocks #538, needs design |

### TIER 4: High Risk (Require Design/Planning First)

| Issue | Risk Factor |
|-------|-------------|
| #1239 | Major refactoring - composition vs inheritance |
| #548 | Cargo system - complex feature design needed |
| #1182 | Space highways - complex, external resources |
| #546 | Multiple ship models - significant scope |

---

## Recommended Execution Order

### Sprint 1 - Unblock Chain
1. **#1214** (waypoints layers model) - Quick win that starts unblock chain
2. **#1187** (hull damage) - Very simple, parallel work
3. **#1204** (long range radar widget) - Unblocks signals station

### Sprint 2 - Build on Foundation
4. **#1206** (signals jobs system) - Now unblocked
5. **#1209** (relay radar widget) - Now unblocked
6. **#1262** (navigator radar widget)

### Sprint 3 - Polish & Stations
7. **#1233** (broken status in damage widget)
8. **#1210** (waypoints layers widget) - Now unblocked by #1214
9. **#1238** (ship room lifecycle) - Finish remaining 2 items

---

## Risk Mitigation Notes

1. **Avoid #1239** (composition refactor) until critical path complete - high cascading risk
2. **#548** (cargo) and **#539** (ship-in-ship docking) need design clarification before implementation
3. **#788** (QA armor) can run in parallel as validation work
4. Consider updating issue files to remove stale `blocked-by` references

---

## Dependency Graph

```
#1185 (CLOSED) ─┬─► #1214 ─► #1210 ─┬─► #1211 (relay station)
                │                    │
                └─► #1209 ──────────┘

#1205 (CLOSED) ─► #1206 ─┬─► #1208 (signals station)
                         │
#1204 ───────────────────┘

#1262 ─► #1261 (navigator station)

#539 ─► #538 (dock master)
```
