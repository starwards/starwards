import { Projectile, SpaceObject, Spaceship, projectileModels } from '../space';
import { SpaceManager, XY, calcShellSecondsToLive, capToRange, lerp } from '../logic';
import { Vec2, gaussianRandom } from '..';

import { ChainGun } from './chain-gun';
import { DeepReadonly } from 'ts-essentials';
import { EPSILON } from '../logic';
import { Magazine } from './magazine';
import { ShipState } from './ship-state';
import { SmartPilotMode } from './smart-pilot';
import { uniqueId } from '../id';

export function resetChainGun(chainGun: ChainGun) {
    chainGun.angleOffset = 0;
    chainGun.rateOfFireFactor = 1;
    chainGun.shellRangeMode = SmartPilotMode.DIRECT;
}

type ShipManager = {
    target: SpaceObject | null;
    state: ShipState;
};

export function switchToAvailableAmmo(chainGun: ChainGun, magazine: Magazine) {
    if (chainGun.projectile === 'None') {
        for (const projectileModel of projectileModels) {
            if (chainGun.design[`use_${projectileModel}`] && magazine[`count_${projectileModel}`] > 0) {
                chainGun.projectile = projectileModel;
            }
        }
    }
}
export class ChainGunManager {
    constructor(
        public chainGun: ChainGun,
        public spaceObject: DeepReadonly<Spaceship>,
        public ship: ShipState,
        private spaceManager: SpaceManager,
        private shipManager: ShipManager
    ) {
        switchToAvailableAmmo(chainGun, ship.magazine);
    }

    public setShellRangeMode(value: SmartPilotMode) {
        if (value === SmartPilotMode.TARGET && !this.shipManager.target) {
            // eslint-disable-next-line no-console
            console.error(new Error(`attempt to set chainGun.shellRangeMode to TARGET with no target`));
        } else {
            if (value !== this.chainGun.shellRangeMode) {
                this.chainGun.shellRangeMode = value;
                this.chainGun.shellRange = 0;
            }
        }
    }

    update(deltaSeconds: number) {
        this.calcShellSecondsToLive();
        this.updateChainGun(deltaSeconds);
        this.fireChainGun();
    }

    private calcShellSecondsToLive() {
        if (this.chainGun.design.overrideSecondsToLive > 0) {
            this.chainGun.shellSecondsToLive = this.chainGun.design.overrideSecondsToLive;
        } else {
            const aimRange = (this.chainGun.design.maxShellRange - this.chainGun.design.minShellRange) / 2;
            let baseRange: number | undefined = undefined;
            switch (this.chainGun.shellRangeMode) {
                case SmartPilotMode.DIRECT:
                    baseRange = this.chainGun.design.minShellRange + aimRange;
                    break;
                case SmartPilotMode.TARGET:
                    baseRange = capToRange(
                        this.chainGun.design.minShellRange,
                        this.chainGun.design.maxShellRange,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        XY.lengthOf(XY.difference(this.shipManager.target!.position, this.shipManager.state.position))
                    );
                    break;
                default:
                    throw new Error(
                        `unknown state ${SmartPilotMode[this.chainGun.shellRangeMode]} (${
                            this.chainGun.shellRangeMode
                        })`
                    );
            }
            const range = capToRange(
                this.chainGun.design.minShellRange,
                this.chainGun.design.maxShellRange,
                baseRange + lerp([-1, 1], [-aimRange, aimRange], this.chainGun.shellRange)
            );
            this.chainGun.shellSecondsToLive = calcShellSecondsToLive(this.shipManager.state, this.chainGun, range);
        }
    }

    private updateChainGun(deltaSeconds: number) {
        const chainGun = this.chainGun;
        if (chainGun.projectile !== 'None' && !chainGun.design[`use_${chainGun.projectile}`]) {
            chainGun.projectile = 'None';
        }
        if (chainGun.isFiring && chainGun.broken) {
            chainGun.isFiring = false;
        }
        if (
            chainGun.isFiring &&
            chainGun.projectile !== 'None' &&
            this.shipManager.state.magazine[`count_${chainGun.projectile}`] <= 0
        ) {
            chainGun.isFiring = false;
        }
        if (chainGun.cooldown > 0) {
            // charge weapon
            chainGun.cooldown -= deltaSeconds * chainGun.design.bulletsPerSecond * chainGun.rateOfFireFactor;
            if (!chainGun.isFiring && chainGun.cooldown < 0) {
                chainGun.cooldown = 0;
            }
        }
    }

    private fireChainGun() {
        const chaingun = this.chainGun;
        if (chaingun.isFiring && chaingun.cooldown <= 0 && chaingun.projectile !== 'None') {
            chaingun.cooldown += 1;
            this.shipManager.state.magazine.count_CannonShell -= 1;
            const projectile = new Projectile(chaingun.projectile);
            projectile.angle = gaussianRandom(
                this.spaceObject.angle + chaingun.angle + chaingun.angleOffset,
                chaingun.design.bulletDegreesDeviation
            );
            projectile.velocity = Vec2.sum(
                this.spaceObject.velocity,
                XY.rotate({ x: chaingun.design.bulletSpeed, y: 0 }, projectile.angle)
            );
            const shellPosition = Vec2.make(
                XY.sum(
                    this.spaceObject.position, // position of ship
                    XY.byLengthAndDirection(this.spaceObject.radius + projectile.radius + EPSILON, projectile.angle), // muzzle related to ship
                    XY.byLengthAndDirection(projectile.radius * 2, projectile.angle) // some initial distance
                )
            );
            projectile.init(uniqueId('shell'), shellPosition);
            if (projectile.design.homing) {
                projectile.targetId = this.ship.targetId;
                projectile.secondsToLive = projectile.design.homing.secondsToLive;
            } else {
                projectile.secondsToLive = chaingun.shellSecondsToLive;
            }
            this.spaceManager.insert(projectile);
        }
    }
}
