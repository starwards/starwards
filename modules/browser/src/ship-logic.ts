import { SelectionContainer } from './radar/selection-container';
import { ShipDriverRead } from './driver';
import { SpaceState } from '@starwards/model';

// TODO: move to model? (along with SelectionContainer)
export function trackTargetObject(space: SpaceState, ship: ShipDriverRead): SelectionContainer {
    const result = new SelectionContainer().init(space);
    const updateSelectedTarget = () => {
        const targetObj = ship.state.targetId && space.get(ship.state.targetId);
        result.set(targetObj ? [targetObj] : []);
    };
    ship.events.on('targetId', updateSelectedTarget);
    space.events.on('add', () => setTimeout(updateSelectedTarget, 0));
    updateSelectedTarget();
    return result;
}
