---
id: 1312
title: "bug: tweakpanel ignores update from state after slider drag"
status: closed
labels: [bug, UI]
created: 2022-11-16
updated: 2023-02-07
assignee: 
milestone: 
blocked-by: []
refs: []
---

reproduce: in GM, take a ship that is close to other objects (1,000 meters), tweak its `warp>desiredLevel`.

When dragging, the slider stays on the drop spot (faulty)
when typing number, it shows reset to 0 (desired)