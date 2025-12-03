---
id: 1434
title: "flaky test: helm assist rotationFromTargetTurnSpeed achieves target turnSpeed in a reasonable time"
status: open
labels: [bug, automation, core game logic]
created: 2023-02-05
updated: 2023-02-05
assignee:
refs: []
---

## Problem
Property-based test failure: "expected -1.25 to be close to 0 +/- 1" in helm-assist spec.

The test `helm assist > rotationFromTargetTurnSpeed > achieves target turnSpeed in a reasonable time` is flaky and occasionally fails.

## Notes
- This is a property-based test
- May be related to float precision issues
