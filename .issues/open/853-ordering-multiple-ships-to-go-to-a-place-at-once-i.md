---
id: 853
title: ordering multiple ships to go to a place at once is broken
status: open
labels: [bug, help wanted, good first issue, core game logic]
created: 2022-06-13
updated: 2022-10-19
assignee: 
milestone: 
blocked-by: []
refs: [#845]
---

context: the GM orders multiple ships to move to a location (selects them all and then right-clicks on point in the map)

current: every ship will go to the same point in the map

desired: every ship will go to a slightly different point, retaining its relative position in the group's formation. 
The breakdown of different destinations should happen in the space manager when it dispatches the command to each ship.
refertence: #845
