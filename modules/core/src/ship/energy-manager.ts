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

export class EnergyManager implements EnergySource, Updateable {
    private epm = new Map<ShipSystem, EpmEntry>();
    constructor(
        private state: ShipState,
        private heatManager: HeatManager,
    ) {}

    trySpendEnergy = (value: number, system?: ShipSystem): boolean => {
        if (value < 0) {
            logWarn('probably an error: spending negative energy');
        }
        if (this.state.reactor.energy > value) {
            if (system) {
                system.energyStarved = false;
                if (!this.epm.has(system)) {
                    this.epm.set(system, new EpmEntry());
                }

                const entry = this.epm.get(system)!;
                entry.total = entry.total + value * SECONDS_IN_MINUTE;
            }
            this.state.reactor.energy = this.state.reactor.energy - value;
            if (system) {
                this.addPowerHeat(value, system.energyPerMinute, system);
            }
            return true;
        }
        this.state.reactor.energy = 0;
        if (system) {
            system.energyStarved = true;
        }
        return false;
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
        // `trySpendEnergy` only flags the *drawing* system — a reactor sitting at zero with
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
