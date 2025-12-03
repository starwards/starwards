---
id: 842
title: improve explosion damage ship angle test
status: open
labels: [core game logic, quality]
created: 2022-06-11
updated: 2022-10-19
assignee: 
milestone: 
blocked-by: []
refs: []
---

in `modules\model\test\ship-manager.spec.ts`: test 'explosion must damage only affected areas'.

The test only checks for explosion directly behind the ship.
It should check many values of `explosionAngleToShip` (-180 to 180). if it breaks - fix either the test or the logic.
