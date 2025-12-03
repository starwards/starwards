---
id: 1239
title: Use composition instead of inheritance in ship-state
status: open
labels: [core game logic]
created: 2022-10-26
updated: 2022-10-26
assignee:
refs: []
---

## Problem
`ShipState` inherits from `Spaceship`, causing overlapping fields and state management confusion.

## Expected
The space object should become a property of ship state rather than a parent class. It should be updated each game loop using the `.assign()` method to preserve UI reactivity.
