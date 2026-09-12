import { Die, EnergySource, HeatSink } from './ship-manager-abstract';
import { Faction, Projectile, ScanLevel, SpaceObject, Spaceship, ammoDesigns, ammoTypes } from '../space';
import { IterationData, Updateable } from '../updateable';
import { SpaceManager, XY, calcShellSecondsToLive, capToRange, lerp } from '../logic';

import { ChainGun } from './chain-gun';
import { DeepReadonly } from 'ts-essentials';
import { EPSILON } from '../logic';
import { Iterator } from '../logic/iteration';
import { Magazine } from './magazine';
import { ShipState } from './ship-state';
import { SmartPilotMode } from './smart-pilot';
import { Tube } from './tube';
import { Vec2 } from '..';
import { createLogger } from '../logger';
import { uniqueId } from '../id';

const { error: logError } = createLogger('chain-gun');

export function resetChainGun(chainGun: ChainGun) {
    chainGun.bearingSkew = 0;
    chainGun.rateOfFireFactor = 1;
    chainGun.shellRangeMode = SmartPilotMode.DIRECT;
}

type ShipManager = {
    readonly weaponsTarget: SpaceObject | null;
};

/**
 * `evenIfDepleted` also switches away from a selected type whose magazine count has hit 0 (NPC
 * automation, so a bot never sits silent holding a depleted type while other types are loadable —
 * issue #2237). Defaults to off: the constructor call below runs for player ships too, and a
 * player's manual ammo selection must never be overridden by this function.
 *
 * A magazine count of 0 alone isn't "depleted": the count is decremented the instant a round
 * moves into the chamber (`loadedProjectile`), before it has fired, so the type's last round can
 * be mid-load while its count already reads 0. Switching away then would hit
 * `ChainGunManager.updateChainGun`'s unload path, which credits that chambered round back to the
 * magazine — undoing the depletion this function was just asked to react to, and flapping the
 * selection back and forth every tick. Only treat it as depleted once nothing of that type is
 * chambered either.
 */
export function switchToAvailableAmmo(chainGun: ChainGun, magazine: Magazine, evenIfDepleted = false) {
    const depleted =
        chainGun.projectile !== 'None' &&
        evenIfDepleted &&
        chainGun.loadedProjectile !== chainGun.projectile &&
        magazine.getCount(chainGun.projectile) === 0;
    if (chainGun.projectile === 'None' || depleted) {
        chainGun.projectile = new Iterator(ammoTypes)
            .filter((p) => chainGun.design.isAmmoEnabled(p) && magazine.getCount(p) > 0)
            .firstOr('None');
    }
}
export class ChainGunManager implements Updateable {
    /**
     * used to accuretly simulate very high rate of fire
     */
    private loadingRemainder = 0;

    /**
     * Per-instance, starts at 0 every time a ShipManager (re)builds its mounts — deliberately NOT
     * the game-wide `uniqueId` counter, which keeps incrementing across a process's whole lifetime
     * and would make the same in-game shot draw a different die roll depending on how many shells
     * any ship fired earlier in the process. Combined with `mountId` (unique per mount on this
     * ship) and the ship's own id, this reproduces the same aim-deviation sequence for a replayed
     * scenario regardless of what else happened earlier in the process.
     */
    private shotSeq = 0;

    constructor(
        public chainGun: ChainGun,
        public spaceObject: DeepReadonly<Spaceship>,
        public state: ShipState,
        private spaceManager: SpaceManager,
        private shipManager: ShipManager,
        private energyManager: EnergySource,
        private heatSink: HeatSink,
        private die: Die,
        private mountId: string,
    ) {
        switchToAvailableAmmo(chainGun, state.magazine);
    }

    public setShellRangeMode(value: SmartPilotMode) {
        if (value === SmartPilotMode.TARGET && !this.shipManager.weaponsTarget) {
            logError(new Error(`attempt to set chainGun.shellRangeMode to TARGET with no target`));
        } else {
            if (value !== this.chainGun.shellRangeMode) {
                this.chainGun.shellRangeMode = value;
                this.chainGun.shellRange = 0;
            }
        }
    }

    update({ deltaSeconds }: IterationData) {
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

                        XY.distance(this.shipManager.weaponsTarget!.position, this.state.position),
                    );
                    break;
                default:
                    throw new Error(
                        `unknown state ${SmartPilotMode[this.chainGun.shellRangeMode]} (${
                            this.chainGun.shellRangeMode
                        })`,
                    );
            }
            const range = capToRange(
                this.chainGun.design.minShellRange,
                this.chainGun.design.maxShellRange,
                baseRange + lerp([-1, 1], [-aimRange, aimRange], this.chainGun.shellRange),
            );
            this.chainGun.shellSecondsToLive = calcShellSecondsToLive(this.chainGun, range);
        }
    }

    private updateChainGun(deltaSeconds: number) {
        const chainGun = this.chainGun;
        if (chainGun.projectile !== 'None' && !chainGun.design.isAmmoEnabled(chainGun.projectile)) {
            chainGun.changeProjectileCommand = true;
        }
        if (chainGun.changeProjectileCommand) {
            chainGun.changeProjectileCommand = false;
            const enabledAmmo = new Iterator(ammoTypes).filter((p) => chainGun.design.isAmmoEnabled(p));
            if (chainGun.projectile === 'None') {
                chainGun.projectile = enabledAmmo.firstOr('None');
            } else {
                chainGun.projectile = enabledAmmo.elementAfter(chainGun.projectile);
            }
        }
        if (!chainGun.effectiveness) {
            chainGun.isFiring = false;
        }
        if (!chainGun.isFiring) {
            this.loadingRemainder = 0;
        }
        const dontLoad =
            chainGun.projectile !== 'None' &&
            chainGun.loading === 0 &&
            this.state.magazine.getCount(chainGun.projectile) < 1;
        const loadingDelta =
            chainGun.design.bulletsPerSecond * chainGun.rateOfFireFactor * chainGun.effectiveness * deltaSeconds;
        const loadingEnergy =
            chainGun.design.bulletsPerSecond * chainGun.effectiveness * deltaSeconds * chainGun.design.energyCost;
        if (loadingDelta > 0) {
            // const loadAction = this.calcLoadAction();
            if (
                chainGun.loadedProjectile !== 'None' &&
                (chainGun.projectile !== chainGun.loadedProjectile || !chainGun.loadAmmo)
            ) {
                // unload
                if (this.energyManager.trySpendEnergy(loadingEnergy, chainGun)) {
                    chainGun.loading -= loadingDelta;
                    if (chainGun.loading <= 0) {
                        chainGun.loading = 0;
                        this.state.magazine.setCount(
                            chainGun.loadedProjectile,
                            this.state.magazine.getCount(chainGun.loadedProjectile) + 1,
                        );
                        chainGun.loadedProjectile = 'None';
                    }
                }
            } else if (chainGun.projectile !== 'None' && chainGun.loadAmmo && chainGun.loading < 1 && !dontLoad) {
                // load
                if (this.energyManager.trySpendEnergy(loadingEnergy, chainGun)) {
                    if (chainGun.loading === 0) {
                        this.state.magazine.setCount(
                            chainGun.projectile,
                            this.state.magazine.getCount(chainGun.projectile) - 1,
                        );
                        chainGun.loadedProjectile = chainGun.projectile;
                        chainGun.loading += this.loadingRemainder;
                        this.loadingRemainder = 0;
                    }
                    chainGun.loading += loadingDelta;
                    if (chainGun.loading >= 1) {
                        this.loadingRemainder = chainGun.loading - 1;
                        chainGun.loading = 1;
                    }
                }
            }
        }
    }

    private fireChainGun() {
        const chainGun = this.chainGun;
        const safetyLocked = Tube.isInstance(chainGun) && chainGun.safetyLocked;
        if (
            chainGun.effectiveness > 0 &&
            chainGun.isFiring &&
            !safetyLocked &&
            chainGun.loading >= 1 &&
            chainGun.loadedProjectile !== 'None'
        ) {
            const firedProjectileType = chainGun.loadedProjectile;
            const projectile = new Projectile(firedProjectileType);
            // stamped on every projectile; only cluster munitions read it (see Projectile.warheadDesign)
            projectile.warhead = chainGun.clusterWarhead;
            chainGun.loading = 0;
            chainGun.loadedProjectile = 'None';
            projectile.angle = this.die.getGaussian(
                `${this.spaceObject.id}:${this.mountId}:aim:${this.shotSeq++}`,
                chainGun.getGlobalBearing(this.state),
                chainGun.design.bulletDegreesDeviation,
            );
            projectile.velocity = Vec2.sum(
                this.spaceObject.velocity,
                XY.rotate({ x: chainGun.design.bulletSpeed, y: 0 }, projectile.angle),
            );
            const shellPosition = Vec2.make(
                XY.sum(
                    this.spaceObject.position, // position of ship
                    XY.byLengthAndDirection(this.spaceObject.radius + projectile.radius + EPSILON, projectile.angle), // muzzle related to ship
                    XY.byLengthAndDirection(projectile.radius * 2, projectile.angle), // some initial distance
                ),
            );
            projectile.init(uniqueId('shell'), shellPosition);
            projectile.shipId = this.spaceObject.id;
            // Your own shells are identified to you: the weapons officer sees them with a distinct
            // blip colour instead of the UFO/unknown tint. BASIC is a projectile's scan ceiling, so
            // this also keeps every shell in flight out of the scan queue and the demotion loop.
            const firingFactionIndex = Number(this.spaceObject.faction);
            if (firingFactionIndex !== Number(Faction.NONE) && firingFactionIndex < projectile.scanLevels.length) {
                projectile.scanLevels[firingFactionIndex] = ScanLevel.BASIC;
            }
            if (projectile.design.homing) {
                projectile.targetId = this.state.weaponsTarget.targetId;
                projectile.secondsToLive = projectile.design.homing.secondsToLive;
            } else {
                projectile.secondsToLive = chainGun.shellSecondsToLive;
            }
            this.spaceManager.insert(projectile);
            const heatPerShot = ammoDesigns[firedProjectileType].heatPerShot;
            this.heatSink.addHeat(heatPerShot * chainGun.effectiveness, chainGun);
        }
    }
}
