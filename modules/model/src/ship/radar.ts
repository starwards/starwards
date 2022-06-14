import { Schema, type } from '@colyseus/schema';

export class Radar extends Schema {
    public static isInstance = (o: unknown): o is Radar => {
        return (o as Radar)?.type === 'Radar';
    };

    public readonly type = 'Radar';

    @type('float32')
    basicRange = 0;
}
