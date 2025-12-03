---
id: 1180
title: warp system
status: closed
labels: [enhancement, core game logic, new ship system]
created: 2022-10-15
updated: 2022-11-16
assignee: amir-arad
milestone: Mission in the Fringe Features
blocked-by: []
refs: []
---

5 levels of warp (0-4). takes time to move between levels (hence keep "desired" and "actual" warp levels)
can't work with thruster movement (need to reach 0 movement before changing between thrusters and warp)
automatic shutdown ("jam") when objects are around (range: 10,000 meters)
 - [x] add warp system, design, add to Systems status
 - [x] extract movement-manager from ship manager
 - [x] implement warp movement in ship manager, add hotkeys to single pilot
 - [x] implement constraints:
    - [x] warp/ / thrusters combo
    - [x] proximity jam
 - [x] add 2 defectibles