---
id: 781
title: game save and resume
status: closed
labels: [enhancement, help wanted]
created: 2022-05-13
updated: 2022-07-28
assignee: amir-arad
milestone: Mission in the Fringe Features
blocked-by: []
refs: []
---

server only:
 - generate a persisted JSON with the entire game state (all rooms , including non-colyseus, server-only state)
    - (optional) skip field which have the default value
    - (premature but will need later) game elements should be self-contained (meaning, a ship should be described once, both for its space representation and for its internals). This will later be the basis for partial exports and imports, like predefined locations, encounters etc.
 - ability to resume game from saved state
 
 tests: 
  - use above state for relevant tests as fixtures

fullstack:
 - GM can copy game state to clipboard on command
 - main menu ability to start game from clipboard saved state
 