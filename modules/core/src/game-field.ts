import { DefinitionType, Schema, type } from '@colyseus/schema';

const number2Digits = ((target: typeof Schema, field: string) => {
    type('float32')(target, field);

    const constructor = target.constructor as typeof Schema;
    const definition = constructor._definition;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldSetter = definition.descriptors[field].set;
    definition.descriptors[field].set = function (this: Schema, value: number) {
        oldSetter?.call(this, Math.round(value * 1e2) / 1e2);
    };
}) as PropertyDecorator;

export const gameField = (dt: DefinitionType) => {
    if (dt === 'float32') {
        return number2Digits;
    } else return type(dt);
};
