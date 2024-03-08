export interface IterationData {
    readonly deltaSeconds: number;
    readonly deltaSecondsAvg: number;
    readonly totalSeconds: number;
}
export interface Updateable {
    update(data: IterationData): void;
}

export function isUpdateable(v: unknown): v is Updateable {
    return !!(v && typeof v === 'object' && typeof (v as Updateable).update === 'function');
}
