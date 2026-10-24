import {
    Faction,
    GameMap,
    RepairPriority,
    ShipModel,
    ShipState,
    Spaceship,
    Vec2,
    getSystems,
    repairProtocols,
} from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';

/**
 * Parity between an NPC ship and a PC ship (ruling Q1, 2026-10-24: every readout a player can check
 * must agree). This lab puts the same hull, with the same id, die seed and scripted stimulus, in two
 * games, one with the NPC manager and one with the PC manager, and diffs every readout the Target
 * Details screen draws at FULL scan: reactor energy and cells, and per system power, heat, coolant,
 * energy per minute, starvation, effectiveness, defects and hack level, plus the repair queue and
 * flight. Nobody crews either ship; the stimulus is written to state the same way for both. A
 * difference is therefore a difference in the rules each manager runs, or in what automation does to
 * an uncrewed NPC.
 */
const PARITY_MODEL: ShipModel = 'dragonfly-MK1';
const SHIP_ID = 'SHIP';
const TICK_SECONDS = 1 / 60;
/** Readings closer than this (relative to their size, with an absolute floor) are the same. */
const RELATIVE_TOLERANCE = 0.01;
const ABSOLUTE_TOLERANCE = 0.01;

type ShipKind = 'pc' | 'npc';

/** One scripted situation both ships live through. */
interface ParityScenario {
    readonly name: string;
    readonly description: string;
    readonly seconds: number;
    /** Writes the stimulus to the ship's state before the tick at `t`; identical for both kinds. */
    stimulus(state: ShipState, t: number, kind: ShipKind): void;
}

/** The protocol that restores a gun's rate of fire. */
const GUN_REPAIR_PROTOCOL = Object.entries(repairProtocols).find(([, p]) =>
    p.targets.some((target) => target.system === 'chainGuns' && target.field === 'rateOfFireFactor'),
)?.[0];

const parityScenarios: readonly ParityScenario[] = [
    {
        name: 'idle',
        description: 'nothing ordered for 180 s',
        seconds: 180,
        stimulus: () => undefined,
    },
    {
        name: 'gun-burst',
        description:
            'every chain gun is set to fire from 5 s to 35 s with the magazine kept full; 120 s in all. NPC automation owns `isFiring` and clears it with no target, so the NPC does not fire: its gun readouts show an unfired gun, not a different rule',
        seconds: 120,
        stimulus: (state, t) => {
            const firing = t >= 5 && t < 35;
            for (const gun of state.chainGuns) {
                gun.isFiring = firing;
            }
            state.magazine.count_HiExpShell = Math.max(state.magazine.count_HiExpShell, 100);
        },
    },
    {
        name: 'thrust',
        description: 'full manoeuvring thrust with the afterburner held, reversing every 3 s, for 60 s',
        seconds: 60,
        stimulus: (state, t) => {
            const phase = Math.floor(t / 3) % 2 ? 1 : -1;
            state.smartPilot.rotation = phase;
            state.smartPilot.maneuvering.x = phase;
            state.smartPilot.maneuvering.y = -phase;
            state.afterBurnerCommand = 1;
        },
    },
    {
        name: 'defect-and-repair',
        description:
            'at 2 s the first chain gun drops to 30% rate of fire, a thruster loses all capacity, and the repair protocol for the gun is queued at HIGH priority; 300 s in all',
        seconds: 300,
        stimulus: (state, t) => {
            if (t >= 2 && t < 2 + TICK_SECONDS * 2) {
                state.chainGuns[0].rateOfFireFactor = 0.3;
                state.thrusters[0].availableCapacity = 0;
                const slot = state.repairQueue.slots.find((s) => s.protocolId === GUN_REPAIR_PROTOCOL);
                if (slot) {
                    slot.priority = RepairPriority.HIGH;
                }
            }
        },
    },
    {
        name: 'hacked',
        description: 'at 2 s the radars are COMPROMISED and the first chain gun DISABLED; 30 s in all',
        seconds: 30,
        stimulus: (state, t) => {
            if (t >= 2 && t < 2 + TICK_SECONDS * 2) {
                for (const radar of state.radars) {
                    radar.hacked = 0.5;
                }
                state.chainGuns[0].hacked = 0;
            }
        },
    },
];

/** Every readout of a ship the Target Details screen shows at FULL scan, flat and numeric. */
function readouts(state: ShipState): Record<string, number> {
    const out: Record<string, number> = {
        'reactor.energy': state.reactor.energy,
        'reactor.energyCells': state.reactor.energyCells,
        'capsule.integrity': state.capsule.integrity,
        'armor.plateHealthMean':
            state.armor.armorPlates.reduce((sum, plate) => sum + plate.healthRatio, 0) /
            Math.max(1, state.armor.armorPlates.length),
        'magazine.shells': state.magazine.count_HiExpShell + state.magazine.count_ArmPenShell,
        'repairQueue.slots': state.repairQueue.slots.length,
        'repairQueue.running': state.repairQueue.slots.filter((s) => s.priority === RepairPriority.RUNNING).length,
        'repairQueue.progressSum': state.repairQueue.slots.reduce((sum, s) => sum + s.progress, 0),
        'flight.speed': Math.hypot(state.spaceship.velocity.x, state.spaceship.velocity.y),
        'flight.turnSpeed': Math.abs(state.spaceship.turnSpeed),
    };
    for (const system of getSystems(state)) {
        const pointer = system.pointer;
        const s = system.state;
        out[`${pointer}.power`] = s.power;
        out[`${pointer}.heat`] = s.heat;
        out[`${pointer}.coolantFactor`] = s.coolantFactor;
        out[`${pointer}.energyPerMinute`] = s.energyPerMinute;
        out[`${pointer}.energyStarved`] = Number(s.energyStarved);
        out[`${pointer}.effectiveness`] = s.effectiveness;
        out[`${pointer}.hacked`] = s.hacked;
        out[`${pointer}.broken`] = Number(s.broken);
        for (const defect of system.defectibles) {
            out[`${pointer}.${defect.field}`] = (s as unknown as Record<string, number>)[defect.field];
        }
    }
    return out;
}

/** Plays `scenario` on one ship kind and returns its readouts at the end, and the largest each one moved. */
function play(kind: ShipKind, scenario: ParityScenario) {
    const map: GameMap = {
        name: `parity_${scenario.name}`,
        init: (game) => {
            const ship = new Spaceship().init(SHIP_ID, new Vec2(0, 0), PARITY_MODEL, Faction.Gravitas);
            if (kind === 'pc') {
                game.addPlayerSpaceship(ship);
            } else {
                game.addNpcSpaceship(ship);
            }
        },
    };
    const game = HeadlessGame.start(map, 1, { crewedPlayer: kind === 'pc' });
    const state = game.shipManagers.get(SHIP_ID)?.state;
    if (!state) {
        throw new Error('parity ship missing');
    }
    while (game.seconds < scenario.seconds) {
        scenario.stimulus(state, game.seconds, kind);
        game.tick(TICK_SECONDS);
    }
    return readouts(state);
}

export interface ParityRow {
    readonly scenario: string;
    readonly readout: string;
    readonly pc: number | null;
    readonly npc: number | null;
}

const differs = (a: number | null, b: number | null) =>
    a === null || b === null
        ? a !== b
        : Math.abs(a - b) > Math.max(ABSOLUTE_TOLERANCE, RELATIVE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b)));

/** What a rule in the code does differently for an NPC; the evidence is a file and what it does. */
export interface StructuralDifference {
    readonly readout: string;
    readonly pc: string;
    readonly npc: string;
    readonly evidence: string;
}

/** Differences read from the managers, whether or not a scenario here exercises them. */
const structuralDifferences: readonly StructuralDifference[] = [
    {
        readout: 'Reactor energy; each system energy per minute and energy-starved flag',
        pc: '`EnergyManager` meters every draw against the reactor store and scales draws when it runs short',
        npc: '`internalProxy.drawEnergy = () => 1`: every draw is free, the store never moves',
        evidence: 'modules/core/src/ship/ship-manager.ts (`ShipManagerNpc` constructor), `energy-manager.ts`',
    },
    {
        readout: 'Repair queue (slots, running protocol, progress), defect recovery, energy cells spent on repair',
        pc: '`RepairManager` owns one slot per protocol and works the queue',
        npc: 'no `RepairManager`: the queue has no slots and damage is permanent; the repair commands are registered for PC ships only',
        evidence: 'modules/core/src/ship/ship-manager.ts, modules/server/src/ship/room.ts',
    },
    {
        readout: 'Crew order board (captain and doctrine orders, stance)',
        pc: '`CrewOrdersManager` drains `crewOrderCommands`',
        npc: 'none; the board stays empty',
        evidence: 'modules/core/src/ship/ship-manager.ts',
    },
    {
        readout: 'Flight: thrust, speed cap, afterburner',
        pc: '`MovementManager`: capacity, afterburner and speed limits through `internalProxy`, which draws energy',
        npc: '`handleManeuvering` / `capMaxSpeed` apply the commanded vector directly',
        evidence: 'modules/core/src/ship/ship-manager.ts, `movement-manager.ts`',
    },
    {
        readout: 'Smart-pilot modes (manoeuvring and rotation mode)',
        pc: "`StatesToggle` cycles VELOCITY, TARGET, DIRECT on the crew's command",
        npc: 'no toggle; automation writes `smartPilot` commands directly',
        evidence: 'modules/core/src/ship/ship-manager.ts',
    },
    {
        readout: 'Heat: coolant split and gun power',
        pc: 'set by the engineer; `HeatManager` default split until then',
        npc: '`AutomationManager.manageHeat` reallocates coolant, backs gun power off and latches a ceasefire (a reflex, not a rule)',
        evidence: 'modules/core/src/ship/automation-manager.ts (`manageHeat`)',
    },
    {
        readout: 'Scan beams',
        pc: 'swung by the Signals officer',
        npc: '`ScanBeamAutomation` sweeps and follows, for zero-`maxSpeed` hulls (stations, platforms) only',
        evidence: 'modules/core/src/ship/scan-beam-automation.ts, `ship-manager.ts`',
    },
];

export interface ParityReport {
    readonly model: ShipModel;
    readonly scenarios: readonly { readonly name: string; readonly description: string; readonly seconds: number }[];
    /** Readouts compared per scenario. */
    readonly compared: Readonly<Record<string, number>>;
    /** Every readout, per scenario, where the NPC reading differs from the PC reading at the end. */
    readonly differing: readonly ParityRow[];
    readonly structural: readonly StructuralDifference[];
}

export function runParity(scenarios: readonly ParityScenario[] = parityScenarios): ParityReport {
    const compared: Record<string, number> = {};
    const differing: ParityRow[] = [];
    for (const scenario of scenarios) {
        const pc = play('pc', scenario);
        const npc = play('npc', scenario);
        const keys = [...new Set([...Object.keys(pc), ...Object.keys(npc)])];
        compared[scenario.name] = keys.length;
        for (const readout of keys) {
            const a = pc[readout] ?? null;
            const b = npc[readout] ?? null;
            if (differs(a, b)) {
                differing.push({ scenario: scenario.name, readout, pc: a, npc: b });
            }
        }
    }
    return {
        model: PARITY_MODEL,
        scenarios: scenarios.map(({ name, description, seconds }) => ({ name, description, seconds })),
        compared,
        differing,
        structural: structuralDifferences,
    };
}

const num = (x: number | null) => (x === null ? 'absent' : Number.isInteger(x) ? String(x) : x.toFixed(2));

/** The readout key without its per-system pointer: `/chainGuns/0.heat` becomes `heat`. */
function readoutClass(readout: string): string {
    return readout.startsWith('/') ? readout.slice(readout.lastIndexOf('.') + 1) : readout;
}

/** The markdown parity report: structural differences, then each scenario's differing readouts by class. */
export function parityMarkdown(report: ParityReport): string {
    const lines = [
        '# NPC vs PC parity report',
        '',
        `Hull \`${report.model}\`, same id and die seed, nobody crewing either ship. A readout is listed when the NPC reading differs from the PC reading at the end of the scenario (tolerance ${RELATIVE_TOLERANCE * 100}% relative, ${ABSOLUTE_TOLERANCE} absolute). Ruling Q1 (2026-10-24): every readout a player can check must agree; this is the list of those that do not.`,
        '',
        '## Differences in the rules (read from the managers)',
        '',
        '| readout | PC ship | NPC ship | evidence |',
        '|---|---|---|---|',
        ...report.structural.map((d) => `| ${d.readout} | ${d.pc} | ${d.npc} | ${d.evidence} |`),
        '',
        '## Measured differences',
        '',
    ];
    for (const scenario of report.scenarios) {
        const rows = report.differing.filter((r) => r.scenario === scenario.name);
        lines.push(
            `### ${scenario.name}`,
            '',
            `${scenario.description}. ${rows.length} of ${report.compared[scenario.name]} readouts differ.`,
            '',
        );
        const classes = [...new Set(rows.map((r) => readoutClass(r.readout)))].sort();
        if (!rows.length) {
            lines.push('No readout differs.', '');
            continue;
        }
        lines.push('| readout class | differing | examples (PC / NPC) |', '|---|---|---|');
        for (const cls of classes) {
            const own = rows.filter((r) => readoutClass(r.readout) === cls);
            const examples = own
                .slice(0, 3)
                .map((r) => `${r.readout}: ${num(r.pc)} / ${num(r.npc)}`)
                .join('; ');
            lines.push(`| ${cls} | ${own.length} | ${examples} |`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
