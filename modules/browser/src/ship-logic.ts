import { ShipDriverRead, SpaceDriver, Spaceship } from '@starwards/core';

import { SelectionContainer } from './radar/selection-container';

// TODO: move to core? (along with SelectionContainer)
export function trackTargetObject(spaceDriver: SpaceDriver, ship: ShipDriverRead): SelectionContainer {
    const result = new SelectionContainer().init(spaceDriver);
    const updateSelectedTarget = () => {
        const targetObj = ship.state.targetId && spaceDriver.state.get(ship.state.targetId);
        result.set(targetObj ? [targetObj] : []);
    };
    ship.events.on('/targetId', updateSelectedTarget);
    spaceDriver.events.on('$add', () => setTimeout(updateSelectedTarget, 0));
    updateSelectedTarget();
    return result;
}

export function waitForShip(spaceDriver: SpaceDriver, id: string): Promise<Spaceship> {
    return new Promise((res) => {
        let ship = spaceDriver.state.getShip(id);
        if (ship) {
            return res(ship);
        }
        const tracker = () => {
            ship = spaceDriver.state.getShip(id);
            if (ship) {
                spaceDriver.events.off('/Spaceship', tracker);
                res(ship);
            }
        };
        spaceDriver.events.on(`/Spaceship`, tracker);
    });
}
