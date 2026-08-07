import { DockingMode } from './docking';
import { IterationData } from '../updateable';
import { ShipState } from './ship-state';

/**
 * Heals damaged armour plates while docked. Deliberately has no memory of when docking started:
 * each tick adds this tick's share toward `armor.repairSeconds` to the layer's current health, so
 * undocking mid-repair keeps whatever was regained and redocking simply resumes the same climb.
 * This differs on purpose from the all-or-nothing docked-tier repair queue (PR #2069) — armour
 * repair is logistics, not surgery.
 */
export class ArmorRepairManager {
    constructor(private readonly state: ShipState) {}

    update({ deltaSeconds }: IterationData) {
        if (deltaSeconds <= 0 || this.state.docking.mode !== DockingMode.DOCKED || !this.state.docking.targetId) {
            return;
        }
        const repairSeconds = this.state.armor.repairSeconds;
        if (repairSeconds <= 0) {
            return;
        }
        for (const plate of this.state.armor.armorPlates) {
            for (const layer of plate.layers) {
                if (layer.health < layer.maxHealth) {
                    layer.health = Math.min(
                        layer.maxHealth,
                        layer.health + (layer.maxHealth / repairSeconds) * deltaSeconds,
                    );
                }
            }
        }
    }
}
