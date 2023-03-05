import { capToRange, limitPercisionHard } from '../logic';

import { HeatManager } from './heat-manager';
import { ShipState } from './ship-state';
import { ShipSystem } from './ship-manager';

class EpmEntry {
    total = 0;
}

const SECONDS_IN_MINUTE = 60;

export class EnergyManager {
    private epm = new Map<ShipSystem, EpmEntry>();
    constructor(private state: ShipState, private heatManager: HeatManager) {}

    trySpendEnergy(value: number, system?: ShipSystem): boolean {
        if (value < 0) {
            // eslint-disable-next-line no-console
            console.log('probably an error: spending negative energy');
        }
        if (this.state.reactor.energy > value) {
            if (system) {
                if (!this.epm.has(system)) {
                    this.epm.set(system, new EpmEntry());
                }
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const entry = this.epm.get(system)!;
                entry.total = entry.total + value * SECONDS_IN_MINUTE;
            }
            this.state.reactor.energy = this.state.reactor.energy - value;
            if (system && system.energyPerMinute > this.state.reactor.design.energyHeatEPMThreshold) {
                this.heatManager.addHeat(value * this.state.reactor.design.energyHeat, system);
            }
            return true;
        }
        this.state.reactor.energy = 0;
        return false;
    }

    update(deltaSeconds: number) {
        this.state.reactor.energy = capToRange(
            0,
            this.state.reactor.design.maxEnergy,
            this.state.reactor.energy + this.state.reactor.energyPerSecond * deltaSeconds
        );
        for (const [system, entry] of this.epm.entries()) {
            system.energyPerMinute = system.energyPerMinute * (1 - deltaSeconds) + entry.total;
            if (entry.total < system.energyPerMinute) {
                // patch: allow average to reach zero
                system.energyPerMinute = system.energyPerMinute - 0.01;
            }
            entry.total = 0;
        }
        this.chargeAfterBurner(deltaSeconds);
    }

    private chargeAfterBurner(deltaSeconds: number) {
        if (this.state.reactor.afterBurnerFuel < this.state.reactor.design.maxAfterBurnerFuel) {
            const afterBurnerFuelDelta = Math.min(
                this.state.reactor.design.maxAfterBurnerFuel - this.state.reactor.afterBurnerFuel,
                this.state.reactor.design.afterBurnerCharge * deltaSeconds
            );
            if (
                this.trySpendEnergy(
                    afterBurnerFuelDelta * this.state.reactor.design.afterBurnerEnergyCost,
                    this.state.reactor
                )
            ) {
                this.state.reactor.afterBurnerFuel = limitPercisionHard(
                    this.state.reactor.afterBurnerFuel + afterBurnerFuelDelta
                );
            }
        }
    }
}
