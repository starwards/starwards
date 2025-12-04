---
id: 1459
title: "flakey test: helm assist moveToTarget (FWD only) reach target in good time from 0 speed"
status: open
labels: [bug, core game logic]
created: 2023-02-15
updated: 2023-02-15
assignee: 
milestone: 
blocked-by: []
refs: []
---

see [here](https://app.circleci.com/pipelines/github/starwards/starwards/2862/workflows/48ac4ba7-4df4-4557-bf3f-f70662e68cd1/jobs/7237)

helm assist moveToTarget (FWD only) reach target in good time from 0 speed

Error: Property failed after 76 tests
{ seed: 1236377626, path: "75:7:0:0:0:1:0:1:0:0:0:14:2:3:1:3:1:2:1:2:1", endOnFailure: true }
Counterexample: [-552.88,0.5]
Shrunk 20 time(s)
Got error: AssertionError: position after stabling: expected 5.5 to be close to 0 +/- 5.2578

Stack trace: AssertionError: position after stabling: expected 5.5 to be close to 0 +/- 5.2578
    at /home/circleci/project/modules/core/test/helm-assist.spec.ts:190:89
    at Property.predicate (/home/circleci/project/node_modules/fast-check/lib/check/property/Property.js:17:86)
    at Property.run (/home/circleci/project/node_modules/fast-check/lib/check/property/Property.generic.js:49:33)
    at runIt (/home/circleci/project/node_modules/fast-check/lib/check/runner/Runner.js:21:30)
    at check (/home/circleci/project/node_modules/fast-check/lib/check/runner/Runner.js:73:11)
    at Object.assert (/home/circleci/project/node_modules/fast-check/lib/check/runner/Runner.js:77:17)
    at Object.<anonymous> (/home/circleci/project/modules/core/test/helm-assist.spec.ts:166:16)
    at Promise.then.completed (/home/circleci/project/node_modules/jest-circus/build/utils.js:289:28)
    at new Promise (<anonymous>)
    at callAsyncCircusFn (/home/circleci/project/node_modules/jest-circus/build/utils.js:222:10)
    at _callCircusTest (/home/circleci/project/node_modules/jest-circus/build/run.js:248:40)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at _runTest (/home/circleci/project/node_modules/jest-circus/build/run.js:184:3)
    at _runTestsForDescribeBlock (/home/circleci/project/node_modules/jest-circus/build/run.js:86:9)
    at _runTestsForDescribeBlock (/home/circleci/project/node_modules/jest-circus/build/run.js:81:9)
    at _runTestsForDescribeBlock (/home/circleci/project/node_modules/jest-circus/build/run.js:81:9)
    at run (/home/circleci/project/node_modules/jest-circus/build/run.js:26:3)
    at runAndTransformResultsToJestFormat (/home/circleci/project/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapterInit.js:120:21)
    at jestAdapter (/home/circleci/project/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapter.js:79:19)
    at runTestInternal (/home/circleci/project/node_modules/jest-runner/build/runTest.js:367:16)
    at runTest (/home/circleci/project/node_modules/jest-runner/build/runTest.js:444:34)
    at Object.worker (/home/circleci/project/node_modules/jest-runner/build/testWorker.js:106:12)

Hint: Enable verbose mode in order to have the list of all failing values encountered during the run
    at buildError (/home/circleci/project/node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:131:15)
    at throwIfFailed (/home/circleci/project/node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:143:11)
    at reportRunDetails (/home/circleci/project/node_modules/fast-check/lib/check/runner/utils/RunDetailsFormatter.js:156:16)
    at Object.assert (/home/circleci/project/node_modules/fast-check/lib/check/runner/Runner.js:81:52)
    at Object.<anonymous> (/home/circleci/project/modules/core/test/helm-assist.spec.ts:166:16)
    at Promise.then.completed (/home/circleci/project/node_modules/jest-circus/build/utils.js:289:28)
    at new Promise (<anonymous>)
    at callAsyncCircusFn (/home/circleci/project/node_modules/jest-circus/build/utils.js:222:10)
    at _callCircusTest (/home/circleci/project/node_modules/jest-circus/build/run.js:248:40)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at _runTest (/home/circleci/project/node_modules/jest-circus/build/run.js:184:3)
    at _runTestsForDescribeBlock (/home/circleci/project/node_modules/jest-circus/build/run.js:86:9)
    at _runTestsForDescribeBlock (/home/circleci/project/node_modules/jest-circus/build/run.js:81:9)
    at _runTestsForDescribeBlock (/home/circleci/project/node_modules/jest-circus/build/run.js:81:9)
    at run (/home/circleci/project/node_modules/jest-circus/build/run.js:26:3)
    at runAndTransformResultsToJestFormat (/home/circleci/project/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapterInit.js:120:21)
    at jestAdapter (/home/circleci/project/node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapter.js:79:19)
    at runTestInternal (/home/circleci/project/node_modules/jest-runner/build/runTest.js:367:16)
    at runTest (/home/circleci/project/node_modules/jest-runner/build/runTest.js:444:34)
    at Object.worker (/home/circleci/project/node_modules/jest-runner/build/testWorker.js:106:12)



