import { DamageManager } from './damage-manager';
import { ShipSystem } from './ship-manager';

export const MAX_SYSTEM_HEAT = 100;
export class HeatManager {
    constructor(private damageManager: DamageManager) {}

    addHeat(value: number, system: ShipSystem) {
        system.heat = system.heat + value;
        if (system.heat > MAX_SYSTEM_HEAT) {
            const damageAmount = (system.heat - MAX_SYSTEM_HEAT) * 1;
            system.heat = MAX_SYSTEM_HEAT;
            this.damageManager.damageSystem(system, { id: 'overheat', amount: damageAmount }, 1);
        }
    }
}
