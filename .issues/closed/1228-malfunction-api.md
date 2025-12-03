---
id: 1228
title: malfunction API
status: closed
labels: [core game logic, quality]
created: 2022-10-22
updated: 2022-10-25
assignee: amir-arad
milestone: 
blocked-by: []
refs: [#547]
---

As we add systems we will add to them new malfunctions. 
Several interfaces, and more to come, are involved with generic ship malfunctions (any malfunction in the ship, regardless of its system or effect). 
The main use-case is displaying a list of current malfunctions with some info or action for each malfunction. 
When adding a new malfunction or system, each of these interfaces need to be updated manually. This is both error-prone and time consuming. 
We should have a general mechanism that can be used to declare a state property as a state of malfunction, including all relevant data and logic, so that the malfunction (and its fix) is defined in a single place. All the interfaces then should use this mechanism to detect the ship's malfunctions. 
The main goal here is to keep all logic of the malfunction in one place.

Make a `@malfunction()` annotation for malfunction properties, with reflection capabilities (like the `@range` annotation)
 - [x] the annotation should describe :
   - the normal (functioning) state of the property (for a GM 'fix' button)
   - the name of the malfunction
   - logic / measurement for fixing damage? (for future repair station, #547)
   - threshold for broken state? (to replace system's `get broken()` logic)
   - logic for taking damage?? (to replace hard-coded logic in ship manager)
 - [x] convert all malfunction properties to use the annotation
 - [x] convert damage-report widget  to use the reflection API
 - [x] convert monitor widget to use the reflection API