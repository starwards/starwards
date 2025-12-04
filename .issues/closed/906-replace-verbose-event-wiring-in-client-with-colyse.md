---
id: 906
title: replace verbose event wiring in client with colyseus-events
status: closed
labels: [quality]
created: 2022-06-26
updated: 2022-07-31
assignee: 
milestone: 
blocked-by: []
refs: []
---

use [colyseus-events](https://github.com/starwards/colyseus-events) instead of `wireEvents()` in `modules\browser\src\driver\ship.ts`.

some breakage is expected (for example `Vec2` will change behavior)