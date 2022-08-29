export interface Coded {
    code: number;
}
export function isCoded(v: unknown): v is Coded {
    return !!v && Number.isInteger((v as Coded).code);
}
