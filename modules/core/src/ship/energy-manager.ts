import { EnergySource, ShipSystem } from './ship-manager-abstract';
import { IterationData, Updateable } from '../updateable';

import { HeatManager } from './heat-manager';
import { PowerLevel } from './system';
import { ShipState } from './ship-state';
import { capToRange } from '../logic';
import { createLogger } from '../logger';

const { warn: logWarn } = createLogger('energy');

class EpmEntry {
    total = 0;
}

const SECONDS_IN_MINUTE = 60;

/**
 * Power distribution: when a tick's demand exceeds what the reactor holds, every draw that tick is
 * scaled down by the same supply ratio -- the engineer's job is triage (power levels), not the
 * order systems happen to ask in. A tick's ratio is set at its first draw, from the previous tick's
 * total demand against the energy in store, so a draw that grows mid-tick can still come up short
 * on what is left.
 */
export class EnergyManager implements EnergySource, Updateable {
    private epm = new Map<ShipSystem, EpmEntry>();
    private demand = 0;
    private lastDemand = 0;
    private supplyRatio: number | null = null;
    constructor(
        private state: ShipState,
        private heatManager: HeatManager,
    ) {}

    drawEnergy = (value: number, system?: ShipSystem): number => {
        if (value < 0) {
            logWarn('probably an error: spending negative energy');
        }
        if (value <= 0) {
            return 1;
        }
        if (this.supplyRatio === null) {
            const store = this.state.reactor.energy;
            this.supplyRatio = this.lastDemand > store ? store / this.lastDemand : 1;
        }
        this.demand += value;
        const granted = Math.min(value * this.supplyRatio, this.state.reactor.energy);
        this.state.reactor.energy = this.state.reactor.energy - granted;
        const fraction = granted / value;
        if (system) {
            system.energyStarved = fraction < 1;
            if (!this.epm.has(system)) {
                this.epm.set(system, new EpmEntry());
            }
            const entry = this.epm.get(system)!;
            entry.total = entry.total + granted * SECONDS_IN_MINUTE;
            this.addPowerHeat(granted, system.energyPerMinute, system);
        }
        return fraction;
    };

    /**
     * Systems idling at their default (NORMAL) power or below never generate heat from their own
     * energy flow -- an idle ship must be heat-stable at boot with nobody touching anything
     * (#2121). Only running a system above NORMAL trades heat for extra output; for the reactor the
     * flow is what it generates, for every other system what it draws.
     */
    private addPowerHeat(energy: number, energyPerMinute: number, system: ShipSystem) {
        if (system.power > PowerLevel.NORMAL && energyPerMinute > this.state.reactor.design.energyHeatEPMThreshold) {
            this.heatManager.addHeat(energy * this.state.reactor.design.energyHeat, system);
        }
    }

    update({ deltaSeconds }: IterationData) {
        const reactor = this.state.reactor;
        const generated = reactor.energyPerSecond * reactor.effectiveness * deltaSeconds;
        const generatedPerMinute = deltaSeconds > 0 ? (generated / deltaSeconds) * SECONDS_IN_MINUTE : 0;
        this.addPowerHeat(generated, generatedPerMinute, reactor);
        reactor.energy = capToRange(0, reactor.design.maxEnergy, reactor.energy + generated);
        this.lastDemand = this.demand;
        this.demand = 0;
        this.supplyRatio = null;
        // `drawEnergy` only flags the *drawing* system — a reactor sitting at zero with
        // nothing currently trying to draw from it would otherwise never get flagged itself, and
        // read as fully healthy on the Full Systems Status panel.
        this.state.reactor.energyStarved = this.state.reactor.energy <= 0;
        for (const [system, entry] of this.epm.entries()) {
            system.energyPerMinute = system.energyPerMinute * (1 - deltaSeconds) + entry.total;
            if (entry.total < system.energyPerMinute) {
                // patch: allow average to reach zero
                system.energyPerMinute = system.energyPerMinute - 0.01;
            }
            entry.total = 0;
        }
    }
}
