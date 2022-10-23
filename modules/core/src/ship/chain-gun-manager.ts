import { CannonShell, Explosion, Vec2, gaussianRandom } from '..';
import { SpaceManager, XY, calcShellSecondsToLive, capToRange, lerp } from '../logic';
import { SpaceObject, Spaceship } from '../space';

import { ChainGun } from './chain-gun';
import { DeepReadonly } from 'ts-essentials';
import { EPSILON } from '../logic';
import { ShipState } from './ship-state';
import { SmartPilotMode } from './smart-pilot';
import { uniqueId } from '../id';

export function resetChainGun(chainGun: ChainGun) {
    chainGun.angleOffset = 0;
    chainGun.cooldownFactor = 1;
    chainGun.shellRangeMode = SmartPilotMode.DIRECT;
}

type ShipManager = {
    target: SpaceObject | null;
    state: ShipState;
};

export class ChainGunManager {
    constructor(
        public chainGun: ChainGun,
        public spaceObject: DeepReadonly<Spaceship>,
        public ship: ShipState,
        private spaceManager: SpaceManager,
        private shipManager: ShipManager
    ) {}

    public setIsFiring(isFiring: boolean) {
        if (!isFiring || (!this.chainGun.broken && this.shipManager.state.magazine.cannonShells > 0)) {
            this.chainGun.isFiring = isFiring;
        }
    }

    public setShellRangeMode(value: SmartPilotMode) {
        if (value !== this.chainGun.shellRangeMode) {
            this.chainGun.shellRangeMode = value;
            this.chainGun.shellRange = 0;
        }
    }

    update(deltaSeconds: number) {
        this.calcShellRange();
        this.updateChainGun(deltaSeconds);
        this.fireChainGun();
    }

    private calcShellRange() {
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
                    `unknown state ${SmartPilotMode[this.chainGun.shellRangeMode]} (${this.chainGun.shellRangeMode})`
                );
        }
        const range = capToRange(
            this.chainGun.design.minShellRange,
            this.chainGun.design.maxShellRange,
            baseRange + lerp([-1, 1], [-aimRange, aimRange], this.chainGun.shellRange)
        );
        this.chainGun.shellSecondsToLive = calcShellSecondsToLive(this.shipManager.state, this.chainGun, range);
    }

    private updateChainGun(deltaSeconds: number) {
        const chaingun = this.chainGun;
        if (chaingun.cooldown > 0) {
            // charge weapon
            chaingun.cooldown -= deltaSeconds * chaingun.design.bulletsPerSecond;
            if (!chaingun.isFiring && chaingun.cooldown < 0) {
                chaingun.cooldown = 0;
            }
        }
    }

    private getChainGunExplosion() {
        const result = new Explosion();
        result.secondsToLive = this.chainGun.design.explosionSecondsToLive;
        result.expansionSpeed = this.chainGun.design.explosionExpansionSpeed;
        result.damageFactor = this.chainGun.design.explosionDamageFactor;
        result.blastFactor = this.chainGun.design.explosionBlastFactor;
        return result;
    }

    private fireChainGun() {
        const chaingun = this.chainGun;
        if (
            chaingun.isFiring &&
            chaingun.cooldown <= 0 &&
            !chaingun.broken &&
            this.shipManager.state.magazine.cannonShells > 0
        ) {
            chaingun.cooldown += chaingun.cooldownFactor;
            this.shipManager.state.magazine.cannonShells -= 1;
            const shell = new CannonShell(this.getChainGunExplosion());

            shell.angle = gaussianRandom(
                this.spaceObject.angle + chaingun.angle + chaingun.angleOffset,
                chaingun.design.bulletDegreesDeviation
            );
            shell.velocity = Vec2.sum(
                this.spaceObject.velocity,
                XY.rotate({ x: chaingun.design.bulletSpeed, y: 0 }, shell.angle)
            );
            const shellPosition = Vec2.make(
                XY.sum(
                    this.spaceObject.position, // position of ship
                    XY.byLengthAndDirection(this.spaceObject.radius + shell.radius + EPSILON, shell.angle), // muzzle related to ship
                    XY.byLengthAndDirection(shell.radius * 2, shell.angle) // some initial distance
                )
            );
            shell.init(uniqueId('shell'), shellPosition);
            shell.secondsToLive = chaingun.shellSecondsToLive;
            this.spaceManager.insert(shell);
        }
    }
}
