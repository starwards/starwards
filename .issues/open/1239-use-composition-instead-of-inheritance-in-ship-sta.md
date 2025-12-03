---
id: 1239
title: Use composition instead of inheritance in ship-state 
status: open
labels: [core game logic]
created: 2022-10-26
updated: 2022-10-26
assignee: 
milestone: Mission in the Fringe Features
blocked-by: []
refs: []
---

class `ShipState` inherits `Spaceship` and this causes some problems with the overlapping fields. 
Adding a `@tweakable` annotation to this fields will result in an override in the tweak panel, and only the spaceObject state will become tweakable. 
This also causes mistakes as to where is the correct place to keep the source of truth (it should always be the space state).
For example `targetId` in the space manager is degenerated, and the meaningful state is only in the ShipState object.

I suggest that the space object become a property of the ship state. and not a parent. 
It should be a separate instance, a clone of the space object, that is updated every game loop. if it is replaces instead of updated, it might cause some UI to stop reacting to changes. check with the pilot widget to assert correct behavior. 
I suggest trying the `.assign()` method to update the state.