---
id: 1184
title: overclocking
status: closed
labels: [enhancement, core game logic, new ship mechanic]
created: 2022-10-15
updated: 2023-03-10
assignee: amir-arad
milestone: Mission in the Fringe Features
blocked-by: []
refs: [#1183]
---

each system should have an overclocking enum property (X levels, not a floating point) between shut-down and X3
overclocking affects 
 - effectiveness (performance factor between 0% to 300%)
 - heat usage (see #1183)
 - energy consumption
above 100% the penalty on heat and energy should be double or even exponential (example: at 300% effectiveness, heat and energy footprint may be 500%)

add ui for systems overclocking
add control for system overclocking
 - [x] add to Systems status