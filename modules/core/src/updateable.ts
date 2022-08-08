export interface Updateable {
    update(deltaSeconds: number): void;
}

export function isUpdateable(v: unknown): v is Updateable {
    return !!(v && typeof v === 'object' && typeof (v as Updateable).update === 'function');
}
