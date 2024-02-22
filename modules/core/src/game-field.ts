import { Context, DefinitionType, type } from '@colyseus/schema';

import { number2Digits as n2d } from './number-field';

export const gameField = (dt: DefinitionType, context?: Context) => {
    if (dt === 'float32') {
        return n2d;
    } else return type(dt, context);
};
