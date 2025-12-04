---
id: 1011
title: change SpaceState to only have one collection of objects
status: closed
labels: [core game logic, quality]
created: 2022-08-03
updated: 2022-12-02
assignee: amir-arad
milestone: 
blocked-by: []
refs: []
---

It seems that Collection types (ArraySchema, MapSchema, etc) can hold any items that share the same base type.
https://docs.colyseus.io/colyseus/state/schema/#collections