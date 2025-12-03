---
id: 904
title: use `Symbol.toStringTag` in all model classes
status: closed
labels: [enhancement, help wanted, good first issue, quality]
created: 2022-06-26
updated: 2022-10-20
assignee: 
milestone: 
blocked-by: []
refs: []
---

Currently we have the convention of using property `type` to decide on classes types (instead of `instanceof` which can fail in some dependency scenarios). 
However [Symbol.toStringTag](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/toStringTag) can serve the same purpose with better dev experience.

replace the usage of `type` key in all schema classes, replace with `Symbol.toStringTag`