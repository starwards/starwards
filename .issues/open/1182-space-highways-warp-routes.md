---
id: 1182
title: space highways / warp routes
status: open
labels: [enhancement, core game logic, UI]
created: 2022-10-15
updated: 2023-03-12
assignee: 
milestone: Mission in the Fringe Features
blocked-by: [#1180, #1446]
refs: [#14]
---

Ship should have warp frequency and ability to calibrate it (blocked by #1446)

Implement the space layers feature from helios epsilon version. 
load large .png maps of layers for space route, and use the alpha channel of the relevant map at the ship's position as a factor of the warp system effectiveness.

make navigation radar UI widget (based on relay) and add layers to it. 

make warp frequency calibration ui widget

file names, coordinates, warp factors etc. should be set as part of the map script. technically this means the server should serve the map files to the client on demand (not as part of the client bundle).

most of the logic can be read in the feature original PR: amir-arad/EmptyEpsilon#14
maps are named _space dilation_00004\_*.png_ and located [https://github.com/amir-arad/EmptyEpsilon/tree/master/resources](here).
blocked by #1180 