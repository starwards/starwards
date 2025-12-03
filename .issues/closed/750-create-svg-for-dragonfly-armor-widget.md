---
id: 750
title: create SVG for Dragonfly armor widget
status: closed
labels: [help wanted, good first issue, UI, SVG, graphic assets]
created: 2022-05-04
updated: 2022-07-20
assignee: 
milestone: 
blocked-by: []
refs: []
---

need a new svg for top-down outline of the Dragonfly SF-22 ship, to be used for armor widget instead of `test-circle.svg`.
A simple outline of the exterior shell, in the shape of the ship

Because of the way we use SVG in pixijs, we need the SVG to be large pixel-wise (`test-circle.svg` is 5000x5000 and it works fine)
The line of the outline should be similar to `test-circle.svg` : `stroke-width: 50px; fill: none; stroke: rgb(255, 255, 255);`


reference image of Dragonfly SF-22: 
![dragonfly top-down](https://blog.starwards.space/assets/img/dragonfly7.png)