import { HackLevel, SystemState } from './system';
import { HackableSystemKey, isHackableSystemKey } from './signals';
import { IterationData, Updateable } from '../updateable';
import { FIREWALL_PROTOCOL_ID } from './hack-windows';
import { RepairPriority } from './repair-queue';
import { ScanLevel } from '../space/scan-level';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';

function hackableInstances(state: ShipState, key: HackableSystemKey): SystemState[] {
    switch (key) {
        case 'thrusters':
            return [...state.thrusters];
        case 'chainGuns':
            return [...state.chainGuns];
        case 'smartPilot':
            return [state.smartPilot];
    }
}

/**
 * Beam hacking, attacker side (M4.76). While the Signals officer holds a hack order on the marked
 * target and keeps its FULL scan, progress fills over the system's design `hackSeconds`; on
 * completion the system goes offline for its design `hackOfflineSeconds`. Losing FULL, or the target
 * running a firewall repair, cancels the hack.
 */
export class HackManager implements Updateable {
    constructor(
        private state: ShipState,
        private spaceManager: SpaceManager,
        private getShipState: (id: string) => ShipState | undefined,
    ) {}

    update({ deltaSeconds }: IterationData): void {
        const signals = this.state.signals;
        if (!signals.hackSystem) {
            signals.hackProgress = 0;
            return;
        }
        const refusal = this.refusal();
        if (refusal) {
            this.end(refusal);
            return;
        }
        const target = this.getShipState(this.state.signalsTargetId) as ShipState;
        const key = signals.hackSystem as HackableSystemKey;
        const instances = hackableInstances(target, key);
        const hackSeconds = Math.max(...instances.map((s) => s.design.hackSeconds));
        const effectiveness = signals.effectiveness * signals.jobSpeedFactor;
        signals.hackRefusal = '';
        if (deltaSeconds <= 0 || effectiveness <= 0) {
            return;
        }
        signals.hackProgress = Math.min(1, signals.hackProgress + (deltaSeconds * effectiveness) / hackSeconds);
        if (signals.hackProgress >= 1) {
            for (const system of instances) {
                if (system.design.hackSeconds > 0) {
                    system.hackedSecondsLeft = system.design.hackOfflineSeconds;
                    system.hacked = HackLevel.DISABLED;
                }
            }
            this.end('');
        }
    }

    private refusal(): string {
        const signals = this.state.signals;
        const key = signals.hackSystem;
        if (!isHackableSystemKey(key)) {
            return `${key} is not hackable`;
        }
        const target = this.getShipState(this.state.signalsTargetId);
        if (!target || target === this.state) {
            return 'no target';
        }
        if (this.spaceManager.factionIntel.getScanLevel(target.id, this.state.faction) < ScanLevel.FULL) {
            return 'FULL scan lost';
        }
        const instances = hackableInstances(target, key);
        if (!instances.some((s) => s.design.hackSeconds > 0)) {
            return `${key} is not hackable`;
        }
        if (
            target.repairQueue.slots.some(
                (s) => s.protocolId === FIREWALL_PROTOCOL_ID && s.priority === RepairPriority.RUNNING,
            )
        ) {
            return 'firewall';
        }
        if (instances.every((s) => s.hackedSecondsLeft > 0)) {
            return 'already offline';
        }
        return '';
    }

    private end(refusal: string): void {
        this.state.signals.hackSystem = '';
        this.state.signals.hackProgress = 0;
        this.state.signals.hackRefusal = refusal;
    }
}
