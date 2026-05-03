# Triggers

A trigger is a game state change that activates cross-station communication.
Triggers are the unit of analysis for Metric 8 (handoff edges per trigger).

## Categories

### Command Triggers
Captain-initiated, top-down. The bridge responds to an order.

The Captain decides, communicates the decision, and stations execute.
Communication happens *before* the state change.

Examples: warp sequence, target priority change, retreat call, dock order,
change engagement doctrine.

### Alert Triggers
Station-detected state change, bottom-up. A station reports to the bridge.

A system or sensor detects a change and the station communicates it upward
and laterally. Communication happens *after* the state change.

Examples: new contact on radar, overheat warning, damage received, system
broken, incoming comms, ammo depleted, enemy destroyed.

### Anticipated Alerts

Some alert triggers are predictable downstream consequences of command
triggers. These are not a third category — they are alerts with the
property that the bridge *should have been preparing* for them.

The chain: command → action → anticipated alert.

Examples:
- "Commence firing" (command) → heat spike → overheat warning (anticipated alert)
- "Warp now" (command) → energy drain → low energy (anticipated alert)
- "Begin scan" (command) → scan complete → intel available (anticipated alert)

The design relevance: anticipated alerts are where crew quality shows.
A good crew communicates *before* the alert fires ("firing salvo — expect
heat on weapons"). A novice crew treats every anticipated alert as a surprise.

## Lore

In training materials and in-game language, triggers are presented as
**Protocols** — operation protocols that the crew trains on and executes.

Design docs use "trigger." Player-facing materials use "protocol."

## Relationship to Metrics

Metric 8 counts how many handoff edges activate when a specific trigger fires.
Classify each trigger as command or alert, per phase. A trigger that activates
more stations is a stronger comms-forcing event.
