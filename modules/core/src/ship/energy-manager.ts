import { capToRange, limitPercisionHard } from '../logic';

import { ShipState } from './ship-state';

interface System {
    energyPerMinute: number;
}

class EpmEntry {
    total = 0;
}

export class EnergyManager {
    private epm = new Map<System, EpmEntry>();
    constructor(private state: ShipState) {}

    trySpendEnergy(value: number, system?: System): boolean {
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
                entry.total = entry.total + value * 60;
            }
            this.state.reactor.energy = this.state.reactor.energy - value;
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
