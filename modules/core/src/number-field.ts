import { Schema, type } from '@colyseus/schema';

export const number2Digits = ((target: typeof Schema, field: string) => {
    type('float32')(target, field);

    const constructor = target.constructor as typeof Schema;
    const definition = constructor._definition;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const oldSetter = definition.descriptors[field].set;
    definition.descriptors[field].set = function (this: Schema, value: number) {
        oldSetter?.call(this, Math.round(value * 1e2) / 1e2);
    };
}) as PropertyDecorator;
