---
id: 1186
title: Missiles system (tube systems)
status: closed
labels: [core game logic, new ship system]
created: 2022-10-15
updated: 2022-11-03
assignee: amir-arad
milestone: Mission in the Fringe Features
blocked-by: [#1196]
refs: []
---

for the MVP, generalize the existing chaingun into "barrel", and allow "tube" barrels that shoot missiles instead of cannon-shells, loads very slowly.

A missile is homing, with different flight parameters (rotation, acceleration etc.) and warheads (explosions). 

 - [x] multiple tubes per ship
 - [x] extract ammo types and configuration from ship configuration
 - [ ] make homing missiles

blocked by #1196