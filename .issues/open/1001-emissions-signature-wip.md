---
id: 1001
title: Emissions signature (WIP)
status: open
labels: [enhancement, feature design, core game logic]
created: 2022-07-30
updated: 2022-10-19
assignee: 
milestone: 
blocked-by: []
refs: [#969]
---

Emissions should be calculated based on energy/second value of each object and maybe additional parameters
All ship systems should have energy consumption

## Emissions panel
Panel should be added to display current ship emissions level
The panel should display current emissions level (maybe with breakdown by system).
The panel may show projected detection ranges

## Radar emissions threshold
Radars should have a sensitivity threshold for each scan level. Only if a target crosses that emission threshold will the radar be able to provide relevant information on it.

## Radar time to acquire
Radar should take time to refine the data on each new target.
As target enters radar range it should begin at scan level 0 (as defined in #969 ) and improve over time to maximum scan level based on emissions of the target and radar’s emissions threshold

## Systems emissions
All systems on the ship should have emissions cost attached to them and all systems should have the option of being turned off to avoid paying the emissions price.
Existing systems that should have emissions and on/off added to them
- Smart pilot - target mode should have a high emissions price, velocity should have a low one and direct shouldn’t have one
- Targeting - currently using SmartPilot enum (but we should consider changing it).
“TARGET” mode should have high emissions price.
Switching off (moving to “DIRECT”) mode should have no emissions price, however, no projections on the target should be made in the UI and the shell range should be set manually by the gunner
- Thursters - Using afterburner should have high emissions price. Using thrusters in the regular mode should have emissions based on energy consumption