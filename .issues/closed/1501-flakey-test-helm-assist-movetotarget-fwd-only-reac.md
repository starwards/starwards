---
id: 1501
title: "flakey test: helm assist › moveToTarget › (FWD only) reach target in good time from 0 speed"
status: closed
labels: [bug, quality]
created: 2023-03-12
updated: 2025-11-04
assignee: 
milestone: 
blocked-by: []
refs: []
---

```
FAIL core modules/core/test/helm-assist.spec.ts (87.672 s)
  ● helm assist › moveToTarget › (FWD only) reach target in good time from 0 speed

    Property failed after 79 tests
    { seed: 893659617, path: "78:10:0:0:2:0:2:12:1:2:9:2:1:1:1:1:1", endOnFailure: true }
    Counterexample: [-537.64,0.48]
    Shrunk 16 time(s)
    Got error: AssertionError: position after stabling: expected 5.6 to be close to 0 +/- 5.184
```
https://app.circleci.com/pipelines/github/starwards/starwards/2930/workflows/0b357f77-b4af-4aae-8f0e-001b12153da2/jobs/7447