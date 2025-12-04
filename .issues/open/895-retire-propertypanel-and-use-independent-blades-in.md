---
id: 895
title: retire `PropertyPanel` and use independent blades instead
status: open
labels: [help wanted, UI]
created: 2022-06-23
updated: 2022-10-19
assignee: 
milestone: 
blocked-by: []
refs: [#882]
---

the class `PropertyPanel`  (in `modules\browser\src\panel\property-panel.ts`) was written originally around the [dat.GUI](https://github.com/dataarts/dat.gui) and adapted to [tweakpane](https://cocopon.github.io/tweakpane/). 

## Context
dat.GUI requires an object that has the current state (A.K.A view-model). dat.GUI panel is reading and writing to that object. But, since we have our own state binding solution based on functions and events, communicating state changes to the view-model becomes cumbersome: we maintain a view-model just for the panel and wire our properties to that model and to the panel, and check for changes 60 times per second. 

The new paradigm that is possible in tweakpane is to [skip the view-model binding and build a detached blade](https://cocopon.github.io/tweakpane/blades.html) and then wire the properties directly to the panel via event listeners (as implemented in `modules\browser\src\panel\blades.ts` module).

The suggested path to take is that:

### Provide replacement functionality for these blades in `blades.ts` according to new paradigm:
 - [ ] camera ring (`addConfig()`)
 - [ ] JSON import/export ( see related #882, maybe we don't need this?)

 ### Convert these modules to use  `blades.ts` instead of `PropertyPanel`. 
 ( use `modules\browser\src\widgets\tweak.ts` as usage reference)
 
 add ship properties (in `modules\model\src\ship\ship-properties.ts`) as needed.
 
  - [ ] `modules\browser\src\widgets\gun.ts`
  - [ ] `modules\browser\src\widgets\pilot.ts`
  - [ ] `modules\browser\src\widgets\ship-constants.ts`
  
  ### Then, finally 
   - [ ] delete `modules\browser\src\panel\property-panel.ts`