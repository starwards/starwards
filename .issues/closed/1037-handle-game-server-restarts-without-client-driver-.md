---
id: 1037
title: handle game/server restarts without client driver restart
status: closed
labels: [bug, help wanted, good first issue]
created: 2022-08-10
updated: 2022-09-29
assignee: amir-arad
milestone: 
blocked-by: []
refs: []
---

client driver should automatically reconnect, or at least emit some kind of error if it requires restart.

Use-case: 

 - the game restarts (loads from saved game), but a connected client still holds a ship driver cache (won't try to reconnect to room).