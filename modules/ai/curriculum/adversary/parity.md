# NPC vs PC parity report

Hull `dragonfly-MK1`, same id and die seed, nobody crewing either ship. A readout is listed when the NPC reading differs from the PC reading at the end of the scenario (tolerance 1% relative, 0.01 absolute). Ruling Q1 (2026-10-24): every readout a player can check must agree; this is the list of those that do not.

## Differences in the rules (read from the managers)

| readout | PC ship | NPC ship | evidence |
|---|---|---|---|
| Reactor energy; each system energy per minute and energy-starved flag | `EnergyManager` meters every draw against the reactor store and scales draws when it runs short | `internalProxy.drawEnergy = () => 1`: every draw is free, the store never moves | modules/core/src/ship/ship-manager.ts (`ShipManagerNpc` constructor), `energy-manager.ts` |
| Repair queue (slots, running protocol, progress), defect recovery, energy cells spent on repair | `RepairManager` owns one slot per protocol and works the queue | no `RepairManager`: the queue has no slots and damage is permanent; the repair commands are registered for PC ships only | modules/core/src/ship/ship-manager.ts, modules/server/src/ship/room.ts |
| Crew order board (captain and doctrine orders, stance) | `CrewOrdersManager` drains `crewOrderCommands` | none; the board stays empty | modules/core/src/ship/ship-manager.ts |
| Flight: thrust, speed cap, afterburner | `MovementManager`: capacity, afterburner and speed limits through `internalProxy`, which draws energy | `handleManeuvering` / `capMaxSpeed` apply the commanded vector directly | modules/core/src/ship/ship-manager.ts, `movement-manager.ts` |
| Smart-pilot modes (manoeuvring and rotation mode) | `StatesToggle` cycles VELOCITY, TARGET, DIRECT on the crew's command | no toggle; automation writes `smartPilot` commands directly | modules/core/src/ship/ship-manager.ts |
| Heat: coolant split and gun power | set by the engineer; `HeatManager` default split until then | `AutomationManager.manageHeat` reallocates coolant, backs gun power off and latches a ceasefire (a reflex, not a rule) | modules/core/src/ship/automation-manager.ts (`manageHeat`) |
| Scan beams | swung by the Signals officer | `ScanBeamAutomation` sweeps and follows, for zero-`maxSpeed` hulls (stations, platforms) only | modules/core/src/ship/scan-beam-automation.ts, `ship-manager.ts` |

## Measured differences

### idle

nothing ordered for 180 s. 3 of 146 readouts differ.

| readout class | differing | examples (PC / NPC) |
|---|---|---|
| energyPerMinute | 2 | /radars/0.energyPerMinute: 3.04 / 0; /radars/1.energyPerMinute: 44.40 / 0 |
| repairQueue.slots | 1 | repairQueue.slots: 14 / 0 |

### gun-burst

every chain gun fires from 5 s to 35 s with the magazine kept full; 120 s in all. 4 of 146 readouts differ.

| readout class | differing | examples (PC / NPC) |
|---|---|---|
| energyPerMinute | 2 | /radars/0.energyPerMinute: 3.04 / 0; /radars/1.energyPerMinute: 44.40 / 0 |
| heat | 1 | /chainGuns/0.heat: 63.48 / 0 |
| repairQueue.slots | 1 | repairQueue.slots: 14 / 0 |

### thrust

full manoeuvring thrust with the afterburner held, reversing every 3 s, for 60 s. 15 of 146 readouts differ.

| readout class | differing | examples (PC / NPC) |
|---|---|---|
| energyPerMinute | 6 | /maneuvering.energyPerMinute: 23.27 / 0; /thrusters/0.energyPerMinute: 29.76 / 0; /thrusters/1.energyPerMinute: 0.87 / 0 |
| energyStarved | 5 | /maneuvering.energyStarved: 1 / 0; /thrusters/0.energyStarved: 1 / 0; /thrusters/2.energyStarved: 1 / 0 |
| flight.speed | 1 | flight.speed: 517.14 / 435.05 |
| flight.turnSpeed | 1 | flight.turnSpeed: 22.90 / 1.71 |
| reactor.energy | 1 | reactor.energy: 0.03 / 500 |
| repairQueue.slots | 1 | repairQueue.slots: 14 / 0 |

### defect-and-repair

at 2 s the first chain gun drops to 30% rate of fire, a thruster loses all capacity, and the repair protocol for the gun is queued at HIGH priority; 300 s in all. 4 of 146 readouts differ.

| readout class | differing | examples (PC / NPC) |
|---|---|---|
| energyPerMinute | 2 | /radars/0.energyPerMinute: 3.04 / 0; /radars/1.energyPerMinute: 44.40 / 0 |
| rateOfFireFactor | 1 | /chainGuns/0.rateOfFireFactor: 1 / 0.30 |
| repairQueue.slots | 1 | repairQueue.slots: 14 / 0 |

### hacked

at 2 s the radars are COMPROMISED and the first chain gun DISABLED; 30 s in all. 3 of 146 readouts differ.

| readout class | differing | examples (PC / NPC) |
|---|---|---|
| energyPerMinute | 2 | /radars/0.energyPerMinute: 1.22 / 0; /radars/1.energyPerMinute: 21.90 / 0 |
| repairQueue.slots | 1 | repairQueue.slots: 14 / 0 |
