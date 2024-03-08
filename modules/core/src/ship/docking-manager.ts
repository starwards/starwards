import { SpaceManager, XY, getClosestDockingTarget, isInRange, toDegreesDelta } from '../logic';

import { DamageManager } from './damage-manager';
import { DeepReadonly } from 'ts-essentials';
import { DockingMode } from './docking';
import { ShipManager } from './ship-manager-abstract';
import { ShipState } from './ship-state';
import { Spaceship } from '../space';
import { docker } from '../logic';

const toggleTransition = {
    [DockingMode.DOCKED]: DockingMode.UNDOCKING,
    [DockingMode.DOCKING]: DockingMode.UNDOCKED,
    [DockingMode.UNDOCKED]: DockingMode.DOCKING,
    [DockingMode.UNDOCKING]: DockingMode.DOCKING,
};

export class DockingManager {
    constructor(
        private spaceObject: DeepReadonly<Spaceship>,
        private state: ShipState,
        private spaceManager: SpaceManager,
        private shipManager: ShipManager,
        private damageManager: DamageManager,
    ) {}

    update() {
        this.calcDockingMode();
        if (this.state.docking.toggleCommand) {
            this.state.docking.toggleCommand = false;
            if (this.state.docking.mode === DockingMode.UNDOCKED) {
                this.state.docking.targetId = getClosestDockingTarget(this.state, this.spaceManager.spatialIndex) || '';
            }
            this.state.docking.mode = toggleTransition[this.state.docking.mode];
        }
    }

    private clearDocking() {
        if (this.shipManager.autonomoustask?.type === 'docker') {
            this.shipManager.autonomoustask.cleanup(this.shipManager);
        }
        this.state.docking.targetId = '';
        this.state.docking.mode = DockingMode.UNDOCKED;
        this.spaceManager.detach(this.state.id);
    }

    private calcDockingMode() {
        if (this.state.docking.targetId) {
            const [dockingTarget] = this.spaceManager.getObjectPtr(this.state.docking.targetId);
            if (!dockingTarget || dockingTarget === this.spaceObject) {
                this.clearDocking();
            } else if (this.state.docking.mode === DockingMode.UNDOCKED) {
                // don't reset this.state.docking.targetId
                this.spaceManager.detach(this.state.id);
                if (this.shipManager.autonomoustask?.type === 'docker') {
                    this.shipManager.autonomoustask.cleanup(this.shipManager);
                }
            } else {
                const diff = XY.difference(dockingTarget.position, this.state.position);
                const distance = XY.lengthOf(diff) - dockingTarget.radius - this.state.radius;
                if (distance > this.state.docking.maxDockingDistance) {
                    this.clearDocking();
                } else if (this.state.docking.mode === DockingMode.UNDOCKING) {
                    this.spaceManager.detach(this.state.id);
                    if (this.shipManager.autonomoustask?.type !== 'docker') {
                        this.shipManager.autonomoustask = docker(dockingTarget);
                    }
                    if (distance > this.state.docking.design.undockingTargetDistance) {
                        this.clearDocking();
                    }
                } else {
                    // DOCKED or DOCKING
                    const angleRange = this.state.docking.design.width / 2;
                    const angleDiff = XY.angleOf(diff) - this.state.angle - this.state.docking.design.angle;
                    const isDockedPosition =
                        distance <= this.state.docking.maxDockedDistance &&
                        isInRange(-angleRange, angleRange, toDegreesDelta(angleDiff));
                    if (this.state.docking.mode === DockingMode.DOCKED) {
                        this.spaceManager.attach(this.state.id, this.state.docking.targetId);
                        if (!isDockedPosition) {
                            this.damageManager.damageDocking(this.state.docking);
                            this.state.docking.mode = DockingMode.DOCKING;
                        }
                    } else if (this.state.docking.mode === DockingMode.DOCKING) {
                        this.spaceManager.detach(this.state.id);
                        if (this.shipManager.autonomoustask?.type !== 'docker') {
                            this.shipManager.autonomoustask = docker(dockingTarget);
                        }
                        if (isDockedPosition) {
                            this.state.docking.mode = DockingMode.DOCKED;
                        }
                    } else {
                        // eslint-disable-next-line no-console
                        console.warn(`unexpected docking.mode value ${DockingMode[this.state.docking.mode]}`);
                    }
                }
            }
        } else {
            this.clearDocking();
        }
    }
}
