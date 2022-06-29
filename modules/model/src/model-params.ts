import { MapSchema, Schema, type } from '@colyseus/schema';

export class ModelParams<T extends string> extends Schema implements Map<T, number> {
    static isInstance = (o: unknown): o is ModelParams<string> => {
        return (o as ModelParams<string>)?.type === 'ModelParams';
    };

    readonly type = 'ModelParams';
    readonly [Symbol.toStringTag] = 'ModelParams';

    @type({ map: 'number' })
    params = new MapSchema<number, T>();

    constructor(initialValues?: Record<T, number>) {
        super();
        this.params = new MapSchema(initialValues);
    }

    get(name: T): number {
        const result = this.params.get(name);
        if (result === undefined) {
            throw new Error(`missing value: ${name}`);
        }
        return result;
    }
    set(name: T, value: number) {
        this.params.set(name, value);
        return this;
    }
    clear(): void {
        return this.params.clear();
    }
    delete(key: T): boolean {
        return this.params.delete(key);
    }
    forEach(callbackfn: (value: number, key: T, map: Map<T, number>) => void): void {
        return this.params.forEach(callbackfn);
    }
    has(key: T): boolean {
        return this.params.delete(key);
    }
    get size() {
        return this.params.size;
    }
    entries() {
        return this.params.entries();
    }
    keys(): IterableIterator<T> {
        return this.params.keys();
    }
    values(): IterableIterator<number> {
        return this.params.values();
    }
    [Symbol.iterator]() {
        return this.entries();
    }
}
