import {
    Die,
    ShipManager,
    SmartPilotMode,
    SpaceManager,
    SpaceObject,
    Spaceship,
    limitPercision,
    makeShipState,
    shipConfigurations,
} from '../src';
import { Updateable, isUpdateable } from '../src/updateable';

import { expect } from 'chai';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

export class SpaceSimulator {
    public spaceMgr = new SpaceManager();
    private updateables: Updateable[] = [];
    constructor(private numIterationsPerSecond: number) {}
    get iterationTimeInSeconds() {
        return limitPercision(1 / this.numIterationsPerSecond);
    }
    withObjects(...objects: SpaceObject[]) {
        this.spaceMgr.insertBulk(objects);
        return this;
    }
    withShip(ship: Spaceship, die: Die) {
        const shipMgr = new ShipManager(ship, makeShipState(ship.id, dragonflyConfig), this.spaceMgr, die);
        this.updateables.push(shipMgr);
        if (isUpdateable(die)) {
            this.updateables.push(die);
        }
        this.spaceMgr.insert(ship);
        // init shipMgr for testing
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        shipMgr.setShellRangeMode(SmartPilotMode.DIRECT);
        return shipMgr;
    }

    // withShip2(ship: ShipManager) {
    //     this.shipMgrs.push(ship);
    //     this.spaceMgr.insert(ship.spaceObject as Spaceship);
    //     return this;
    // }

    simulateUntilCondition(predicate: (spaceMgr: SpaceManager) => boolean, timeInSeconds = 0) {
        let timePassed = 0;
        const timeRemainder = Math.abs(
            timeInSeconds - timeInSeconds * this.iterationTimeInSeconds * this.numIterationsPerSecond
        );
        const timeRange = this.iterationTimeInSeconds * 1.5 + timeRemainder;
        while (!predicate(this.spaceMgr)) {
            for (const u of this.updateables) {
                u.update(this.iterationTimeInSeconds);
            }
            this.spaceMgr.update(this.iterationTimeInSeconds);
            timePassed += this.iterationTimeInSeconds;
        }
        if (timeInSeconds > 0) {
            expect(timePassed).to.be.closeTo(timeInSeconds, timeRange);
        }
        return this;
    }

    simulateUntilTime(timeInSeconds: number, body?: (spaceMgr: SpaceManager) => unknown) {
        let timePassed = 0;
        while (timePassed < timeInSeconds) {
            for (const u of this.updateables) {
                u.update(this.iterationTimeInSeconds);
            }
            this.spaceMgr.update(this.iterationTimeInSeconds);
            if (body) {
                body(this.spaceMgr);
            }
            timePassed += this.iterationTimeInSeconds;
        }
        return this;
    }
}
