---
id: 805
title: clean up thruster `getVelocityCapacity` logic
status: open
labels: [core game logic, quality]
created: 2022-05-22
updated: 2022-10-19
assignee: 
milestone: 
blocked-by: []
refs: [#614]
---

it should mirror the `updateVelocityFromThrusters()` method in ship manager. perhaps even be part of that calculation.

 - in thruster.ts , the `capacity()` and `afterBurnerCapacity()` getters are checking the `broken` flag to see if the capacity should be zero. instead, they should multiply by `availableCapacity` (introduced in #614)
 - `speedFactor` and `afterBurnerEffectFactor` are constants used in the past for balancing. consider deleting them.
 - 