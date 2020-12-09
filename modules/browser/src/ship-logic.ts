import { ShipState, SpaceState } from '@starwards/model';

import { SelectionContainer } from './radar/selection-container';

// TODO: move to model? (along with SelectionContainer)
export function trackTargetObject(space: SpaceState, ship: ShipState): SelectionContainer {
    const result = new SelectionContainer(space);
    const updateSelectedTarget = () => {
        const targetObj = ship.targetId && space.get(ship.targetId);
        result.set(targetObj ? [targetObj] : []);
    };
    ship.events.on('targetId', updateSelectedTarget);
    space.events.on('add', () => setTimeout(updateSelectedTarget, 0));
    updateSelectedTarget();
    return result;
}
