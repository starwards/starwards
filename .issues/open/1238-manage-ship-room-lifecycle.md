---
id: 1238
title: manage ship room lifecycle
status: open
labels: [core game logic, UI]
created: 2022-10-26
updated: 2024-03-03
assignee:
refs: []
---

## Problem
Instead of automatically opening a ship room for each ship, open is explicitly via API or GUI. Close room when ship is destroyed.

## Tasks
- [ ] extract API for opening and closing ship room - set a state property "player ship"
- [x] open ship rooms in default map init (2 of 3)
- [x] close ship room on ship destroyed
- [ ] add GUI for opening and closing ship rooms in tweak panel (tweakable)
