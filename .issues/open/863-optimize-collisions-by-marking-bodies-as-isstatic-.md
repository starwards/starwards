---
id: 863
title: optimize collisions by marking bodies as `isStatic = true`
status: open
labels: [core game logic, optimization]
created: 2022-06-15
updated: 2022-10-19
assignee: 
milestone: 
blocked-by: []
refs: []
---

supposedly it skips collision checks for that subject, so it might be good to use for subjects that ignore collisions (destroyed, frozen)
see:
[here](https://github.com/Prozi/detect-collisions/issues/27#issuecomment-1155416296) and [here](https://github.com/Prozi/detect-collisions/search?q=isStatic)