---
id: 896
title: add all space objects properties to tweak panel
status: open
labels: [help wanted, good first issue, UI]
created: 2022-06-23
updated: 2022-10-26
assignee: 
milestone: 
blocked-by: []
refs: []
---

The tweak panel is at `modules\browser\src\widgets\tweak.ts`

adding these properties will require adding a state property+command to `modules\model\src\space\space-properties.ts` and a driver property to `modules\browser\src\driver\space.ts` under `ObjectsApi.makeObjectApi()`. 
See the `freeze` property for example, it is a good reference in all places.

add these properties to all space objects:
 - [x] freeze
 - [ ] velocity (use [point 2D](https://cocopon.github.io/tweakpane/input-bindings.html#point) blade)
 - [x] radius (min. 0.01)
 - [x] angle (0 to 360)
 - [x] turn Speed (no range)
 
 add these properties to `CannonShell`:
  - [x] secondsToLive (min. 0)
  
 add these properties to `Spaceship`:
  - [ ] targetId
  - [x] Faction  
  - [ ] radarRange (read only)
  - [x] model (changing should make no effect on constants, but will affect what players see on science screen)