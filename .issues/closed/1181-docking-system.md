---
id: 1181
title: docking system
status: closed
labels: [enhancement, UI, new ship system]
created: 2022-10-15
updated: 2022-12-02
assignee: amir-arad
milestone: Mission in the Fringe Features
blocked-by: []
refs: []
---

docking system has 4 states: docked, undocked, docking, undocking.
The ship will have a *dockingTarget* property, for the station/ship it is (docked, docking, undocking) to.

only in "undocked" state does the pilot command takes effect. When docking and undocking, a designated bot will be in control of the ship.
in "docked" mode, the ship should be attached to its dockingTarget, moving with it ("external docking")
 - [x] add state to smart pilot
 - [x] add a UI widget and hotkey for changing docking mode.
 - [x] add constraints (ignore human pilot when docking / undocking)
 - [x] implement movement logic