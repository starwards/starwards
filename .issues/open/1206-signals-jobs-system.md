---
id: 1206
title: signals jobs system
status: open
labels: [core game logic, new ship system]
created: 2022-10-15
updated: 2025-11-08
assignee:
refs: [#1205]
---

## Problem
Add collection of jobs per ship with target and action specifications.

## Details
- Jobs execute sequentially in creation order
- Malfunctions affect job success probability, execution duration, and maximum pending job capacity
- Hacking limited to scan level 2 targets (blocked by #1205)
