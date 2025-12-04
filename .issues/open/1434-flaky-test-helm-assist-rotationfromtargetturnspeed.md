---
id: 1434
title: "flaky test : helm assist › rotationFromTargetTurnSpeed › acheives target turnSpeed in a reasonable time"
status: open
labels: [bug, automation, core game logic]
created: 2023-02-05
updated: 2023-02-05
assignee: 
milestone: 
blocked-by: []
refs: []
---

FAIL core modules/core/test/helm-assist.spec.ts (66.651 s)
  ● helm assist › rotationFromTargetTurnSpeed › acheives target turnSpeed in a reasonable time

    Property failed after 59 tests
    { seed: -1100181686, path: "58:16:1:1:0:1:0:0:0:0:0:0:0", endOnFailure: true }
    Counterexample: [1.25]
    Shrunk 12 time(s)
    Got error: AssertionError: expected -1.25 to be close to 0 +/- 1

    Stack trace: AssertionError: expected -1.25 to be close to 0 +/- 1

      85 |                         harness.shipMgr.state.smartPilot.rotation = rotation;
      86 |                     });
    > 87 |                     expect(limitPercision(harness.shipObj.turnSpeed)).to.be.closeTo(0, metrics.errorMargin);
         |                                                                             ^
      88 |                 })
      89 |             );
      90 |         });

      at modules/core/test/helm-assist.spec.ts:87:77
      at Property.predicate (node_modules/fast-check/lib/check/property/Property.js:17:86)
      at Property.run (node_modules/fast-check/lib/check/property/Property.generic.js:41:33)
      at runIt (node_modules/fast-check/lib/check/runner/Runner.js:17:30)
      at check (node_modules/fast-check/lib/check/runner/Runner.js:64:11)
      at Object.assert (node_modules/fast-check/lib/check/runner/Runner.js:68:17)
      at Object.<anonymous> (modules/core/test/helm-assist.spec.ts:70:16)
      Hint: Enable verbose mode in order to have the list of all failing values encountered during the run
      at buildError (node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:131:15)
      at throwIfFailed (node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:143:11)
      at reportRunDetails (node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:156:16)
      at Object.assert (node_modules/fast-check/lib/check/runner/Runner.js:72:52)
      at Object.<anonymous> (modules/core/test/helm-assist.spec.ts:70:16)

