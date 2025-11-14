import { DefinitionType, Schema, type } from '@colyseus/schema';

const number2Digits = ((target: typeof Schema, field: string) => {
    type('float32')(target, field);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const constructor = target.constructor as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const definition = constructor._definition as any;

    // In @colyseus/schema v3, descriptors may not be initialized when decorator runs
    // We need to defer the descriptor modification until the schema is fully initialized
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (definition?.descriptors?.[field]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const oldSetter = definition.descriptors[field].set;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        definition.descriptors[field].set = function (this: Schema, value: number) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            oldSetter?.call(this, Math.round(value * 1e2) / 1e2);
        };
    }
}) as PropertyDecorator;

export const gameField = (dt: DefinitionType) => {
    if (dt === 'float32') {
        return number2Digits;
    } else return type(dt);
};
