import { ShipDriverRead, SpaceDriver } from '@starwards/model';

import { SelectionContainer } from './radar/selection-container';

// TODO: move to model? (along with SelectionContainer)
export function trackTargetObject(spaceDriver: SpaceDriver, ship: ShipDriverRead): SelectionContainer {
    const result = new SelectionContainer().init(spaceDriver);
    const updateSelectedTarget = () => {
        const targetObj = ship.state.targetId && spaceDriver.state.get(ship.state.targetId);
        result.set(targetObj ? [targetObj] : []);
    };
    ship.events.on('targetId', updateSelectedTarget);
    spaceDriver.events.on('/$add', () => setTimeout(updateSelectedTarget, 0));
    updateSelectedTarget();
    return result;
}
