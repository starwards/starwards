---
id: 1205
title: scan levels mechanic
status: closed
labels: [core game logic, UI, new ship mechanic]
created: 2022-10-15
updated: 2025-11-08
assignee:
refs: []
---

## Problem
Make each space object have a scan level for each faction (managed by space manager).

## Scan Levels
- **Lvl0 (UFO)**: physics (distance, heading, rel.speed)
- **Lvl1 (basic)**: Faction, model
- **Lvl2 (advanced)**: armor status, damage reports, list of systems

## Tasks
- [ ] make all existing player radars display Lvl0 objects as unknown
