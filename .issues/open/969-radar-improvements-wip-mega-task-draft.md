---
id: 969
title: Radar improvements (WIP mega-task draft)
status: open
labels: [enhancement, feature design, core game logic]
created: 2022-07-20
updated: 2022-10-19
assignee: 
milestone: 
blocked-by: []
refs: []
---

 - Multiple radars per ship - each providing different value.
 - Each radar has a level of scan that it provides and range. Manual classification can provide better scan levels with less certainty.
 
## Scan levels
each level provides data for manual classification of the next scan level.
 - 0: an object. provides physical data: location, speed, heat, electromagnetic, etc.
 - 1: category classification (like spaceObject Type, but still confusing between small ship and torpedo). provides behavioral data: Scan a ship for a period of time to see thruster usage, etc.
 - 2: model classification. provides full data on ship model
 - 3: full: Electronic warfare stuff: know how to attack and defend better against this specific ship, ability to initiate cyber attacks.

## Transponder
Every ship has a transponder that in normal times provides level 2 information and makes the ship detectable in very long ranges, even behind obstacles.
A ship can shut down its transponder but this is unlawful. usually its a preparation for attack, evade, etc.
If the transponder is active, other ships will default to displaying its information in their radars as a shortcut. That information may be false.
a ship may use transponder as decoy.

## Object tracking
Object tracking (associating an object with an ID in the radar system) is done on level 0 and above. If an object has information (example: it is scanned at level 1 or above, targeted, has custom remarks etc.) as long as it is visible to the ship even at level 0, it has the same identity and data correlated. However, when it breaks out of sight from radar completely it may be disassociated with the old ID. 
Each radar has a grace period in which it keeps the ID so that losing line of sight (LoS) briefly will not result in lost information.
Science officers may get “target lost” alerts if the ship’s target breaks LoS and may try to manually intervene (copy the info to a clipboard, then quickly and manually re-classify an object that seems like the old target when it re-appears).
