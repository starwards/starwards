---
id: 735
title: collisions bug after upgrading detect-collisions to 4.02
status: closed
labels: [bug]
created: 2022-05-01
updated: 2022-06-10
assignee: amir-arad
milestone: 
blocked-by: []
refs: []
---

While shooting and moving around freely (mostly forward, to make my projectiles hit each other) I got this strange behavior:
```
no intersection distance: 40.41335182152047, (x0, y0): 1882.7171, -547.727, r0 = 50, (x1, y1): 1918.7428, -529.4134, r1 = 6.21
modules/model/src/logic/formulas.ts:73
unexpected undefined intersection between explosion and object.
                object data: centre: {"x":1882.7171,"y":-547.727} radius: 50
                explosion data: centre: {"x":1918.7428,"y":-529.4134} radius: 6.21
modules/model/src/logic/space-manager.ts:293
no intersection distance: 40.41335182152047, (x0, y0): 1882.7171, -547.727, r0 = 50, (x1, y1): 1918.7428, -529.4134, r1 = 6.21
modules/model/src/logic/formulas.ts:73
unexpected undefined intersection between explosion and object.
                object data: centre: {"x":1882.7171,"y":-547.727} radius: 50
                explosion data: centre: {"x":1918.7428,"y":-529.4134} radius: 6.21
modules/model/src/logic/space-manager.ts:293
no intersection distance: 37.641675167027394, (x0, y0): 1885.1671, -546.4301, r0 = 50, (x1, y1): 1918.7428, -529.4134, r1 = 6.93
modules/model/src/logic/formulas.ts:73
unexpected undefined intersection between explosion and object.
                object data: centre: {"x":1885.1671,"y":-546.4301} radius: 50
                explosion data: centre: {"x":1918.7428,"y":-529.4134} radius: 6.93
modules/model/src/logic/space-manager.ts:293
no intersection distance: 37.641675167027394, (x0, y0): 1885.1671, -546.4301, r0 = 50, (x1, y1): 1918.7428, -529.4134, r1 = 6.93
modules/model/src/logic/formulas.ts:73
unexpected undefined intersection between explosion and object.
                object data: centre: {"x":1885.1671,"y":-546.4301} radius: 50
                explosion data: centre: {"x":1918.7428,"y":-529.4134} radius: 6.93
modules/model/src/logic/space-manager.ts:293
no intersection distance: 37.641675167027394, (x0, y0): 1885.1671, -546.4301, r0 = 50, (x1, y1): 1918.7428, -529.4134, r1 = 6.93
modules/model/src/logic/formulas.ts:73
unexpected undefined intersection between explosion and object.
                object data: centre: {"x":1885.1671,"y":-546.4301} radius: 50
                explosion data: centre: {"x":1918.7428,"y":-529.4134} radius: 6.93
```

and

```
no intersection distance: 31.35509559943959, (x0, y0): 1890.7245, -543.4888, r0 = 50, (x1, y1): 1918.7428, -529.4134, r1 = 9.329999999999998
modules/model/src/logic/formulas.ts:73
unexpected undefined intersection between explosion and object.
                object data: centre: {"x":1890.7245,"y":-543.4888} radius: 50
                explosion data: centre: {"x":1918.7428,"y":-529.4134} radius: 9.329999999999998
modules/model/src/logic/space-manager.ts:293
no intersection distance: 31.35509559943959, (x0, y0): 1890.7245, -543.4888, r0 = 50, (x1, y1): 1918.7428, -529.4134, r1 = 9.329999999999998
modules/model/src/logic/formulas.ts:73
unexpected undefined intersection between explosion and object.
                object data: centre: {"x":1890.7245,"y":-543.4888} radius: 50
                explosion data: centre: {"x":1918.7428,"y":-529.4134} radius: 9.329999999999998
modules/model/src/logic/space-manager.ts:293
no intersection distance: 31.35509559943959, (x0, y0): 1890.7245, -543.4888, r0 = 50, (x1, y1): 1918.7428, -529.4134, r1 = 9.329999999999998
modules/model/src/logic/formulas.ts:73
unexpected undefined intersection between explosion and object.
                object data: centre: {"x":1890.7245,"y":-543.4888} radius: 50
                explosion data: centre: {"x":1918.7428,"y":-529.4134} radius: 9.329999999999998
modules/model/src/logic/space-manager.ts:293
no intersection distance: 31.35509559943959, (x0, y0): 1890.7245, -543.4888, r0 = 50, (x1, y1): 1918.7428, -529.4134, r1 = 9.329999999999998
modules/model/src/logic/formulas.ts:73
unexpected undefined intersection between explosion and object.
                object data: centre: {"x":1890.7245,"y":-543.4888} radius: 50
                explosion data: centre: {"x":1918.7428,"y":-529.4134} radius: 9.329999999999998
```

