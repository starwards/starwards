import { IterationData, Updateable } from '../updateable';
import { PowerLevel, SystemState, getSystems } from './system';
import { RepairableSystemKey, isProtocolAvailable, repairProtocols } from '../configurations/repair-protocols';
import { RepairPriority } from './repair-queue';
import { ShipState } from './ship-state';

/** Seconds a defect goes unnoticed before the reflex engineer queues its repair (difficulty knob). */
const REPAIR_NOTICING_DELAY_SECONDS = 6;

/** How often (game-time seconds) the reflex engineer looks the ship over for defects. */
const REPAIR_SCAN_INTERVAL_SECONDS = 1;

/** Systems whose defects cost the ship its fight: repaired first. */
const URGENT_REPAIR_SYSTEMS: readonly RepairableSystemKey[] = ['chainGuns', 'thrusters', 'maneuvering', 'reactor'];

type ShedClass = 'radar' | 'tube' | 'gun';

/**
 * One rung of the power-shedding ladder: engages when the reactor store falls below `engageBelow`
 * (fraction of max), releases once it climbs back above `engageBelow + RELEASE_MARGIN`. Each class
 * is held at no more than its cap. Manoeuvring is on no rung: it is the reserve being protected.
 */
const SHED_LADDER: readonly { engageBelow: number; caps: Partial<Record<ShedClass, PowerLevel>> }[] = [
    { engageBelow: 0.5, caps: { radar: PowerLevel.LOW } },
    { engageBelow: 0.3, caps: { radar: PowerLevel.LOW, tube: PowerLevel.LOW, gun: PowerLevel.LOW } },
    { engageBelow: 0.15, caps: { radar: PowerLevel.SHUTDOWN, tube: PowerLevel.SHUTDOWN, gun: PowerLevel.LOW } },
];
const RELEASE_MARGIN = 0.1;

/**
 * The engineer a crewless (NPC) ship does not have: reflexes over the same state a crew drives --
 * system power levels and the repair queue's priority commands -- so an NPC with a real
 * `EnergyManager`/`RepairManager` plays by the player rules without a reactor death spiral (#2208).
 * Grown from the heat reflexes in `AutomationManager.manageHeat`.
 */
export class EngineerGovernor implements Updateable {
    /** How many rungs of {@link SHED_LADDER} are engaged. */
    private rung = 0;
    /** Systems whose `power` the governor lowered, with the level to restore. Only these are ever written. */
    private readonly shed = new Map<SystemState, PowerLevel>();
    private clock = 0;
    private scanAccumulator = 0;
    /** Clock time each damaged protocol was first seen damaged. */
    private readonly noticedAt = new Map<string, number>();

    constructor(private readonly state: ShipState) {}

    update({ deltaSeconds }: IterationData) {
        if (deltaSeconds <= 0) {
            return;
        }
        this.clock += deltaSeconds;
        this.governPower();
        this.scanAccumulator += deltaSeconds;
        if (this.scanAccumulator >= REPAIR_SCAN_INTERVAL_SECONDS) {
            this.scanAccumulator -= REPAIR_SCAN_INTERVAL_SECONDS;
            this.reflexRepair();
        }
    }

    /** Hands every system it shed back at its original level. */
    release() {
        for (const [system, original] of this.shed) {
            system.power = original;
        }
        this.shed.clear();
        this.rung = 0;
    }

    private governPower() {
        const { energy, design } = this.state.reactor;
        const fraction = design.maxEnergy > 0 ? energy / design.maxEnergy : 1;
        while (this.rung < SHED_LADDER.length && fraction < SHED_LADDER[this.rung].engageBelow) {
            this.rung++;
        }
        while (this.rung > 0 && fraction > SHED_LADDER[this.rung - 1].engageBelow + RELEASE_MARGIN) {
            this.rung--;
        }
        const caps = this.rung > 0 ? SHED_LADDER[this.rung - 1].caps : {};
        this.applyCap(this.state.radars, caps.radar);
        this.applyCap(this.state.tubes, caps.tube);
        this.applyCap(this.state.chainGuns, caps.gun);
    }

    private applyCap(systems: Iterable<SystemState>, cap: PowerLevel | undefined) {
        for (const system of systems) {
            const original = this.shed.get(system);
            if (cap === undefined) {
                if (original !== undefined) {
                    system.power = original;
                    this.shed.delete(system);
                }
            } else if (original !== undefined) {
                system.power = Math.min(original, cap);
            } else if (system.power > cap) {
                this.shed.set(system, system.power);
                system.power = cap;
            }
        }
    }

    /** Queues repairs for defects it has noticed (after {@link REPAIR_NOTICING_DELAY_SECONDS}), urgent systems first. */
    private reflexRepair() {
        const damaged = this.damagedProtocolIds();
        for (const id of [...this.noticedAt.keys()]) {
            if (!damaged.has(id)) {
                this.noticedAt.delete(id);
            }
        }
        for (const id of damaged) {
            const since = this.noticedAt.get(id) ?? this.clock;
            this.noticedAt.set(id, since);
            const slot = this.state.repairQueue.slots.find((s) => s.protocolId === id);
            if (slot?.priority !== RepairPriority.OFF || this.clock - since < REPAIR_NOTICING_DELAY_SECONDS) {
                continue;
            }
            const protocol = repairProtocols[id as keyof typeof repairProtocols];
            const urgent = protocol.targets.some((t) => URGENT_REPAIR_SYSTEMS.includes(t.system));
            // one `up` per level: OFF -> LOW is one step, OFF -> HIGH is three
            const raises: number = urgent ? RepairPriority.HIGH : RepairPriority.LOW;
            for (let i = 0; i < raises; i++) {
                this.state.repairQueue.cyclePriorityCommands.push({ protocolId: id, direction: 'up' });
            }
        }
    }

    private damagedProtocolIds() {
        const damaged = new Set<string>();
        const systems = getSystems(this.state);
        for (const [id, protocol] of Object.entries(repairProtocols)) {
            if (protocol.targets.length === 0 || !isProtocolAvailable(this.state, protocol)) {
                continue;
            }
            const isDamaged = systems.some((system) => {
                const key = system.pointer.split('/')[1];
                return system.defectibles.some(
                    (d) =>
                        protocol.targets.some((t) => t.system === key && t.field === d.field) &&
                        (system.state as unknown as Record<string, number>)[d.field] !== d.normal,
                );
            });
            if (isDamaged) {
                damaged.add(id);
            }
        }
        return damaged;
    }
}
