/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { DefinitionType, Schema, type } from '@colyseus/schema';

const number2Digits = ((target: typeof Schema, field: string) => {
    // First, let Colyseus set up the field
    type('float32')(target, field);

    // wrap the Colyseus setter to add rounding
    // Get the descriptor that Colyseus just created
    const colyseusDescriptor = Object.getOwnPropertyDescriptor(target, field);

    if (colyseusDescriptor?.set) {
        // Wrap the Colyseus setter
        const colyseusSetter = colyseusDescriptor.set;
        Object.defineProperty(target, field, {
            get: colyseusDescriptor.get,
            set(this: Schema, value: number) {
                // Round to 2 decimal places before passing to Colyseus
                const rounded = Math.round(value * 1e2) / 1e2;
                colyseusSetter.call(this, rounded);
            },
            enumerable: colyseusDescriptor.enumerable,
            configurable: colyseusDescriptor.configurable,
        });
    } else {
        // If Colyseus didn't create a setter (shouldn't happen in normal usage),
        // fall back to the _definition approach for v2 compatibility
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const definition = (target.constructor as any)._definition;

        if (definition?.descriptors?.[field]) {
            const oldSetter = definition.descriptors[field].set;

            definition.descriptors[field].set = function (this: Schema, value: number) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                oldSetter?.call(this, Math.round(value * 1e2) / 1e2);
            };
        }
    }
}) as PropertyDecorator;

export const gameField = (dt: DefinitionType) => {
    if (dt === 'float32') {
        return number2Digits;
    } else return type(dt);
};
