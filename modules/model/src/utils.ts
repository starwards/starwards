export function getConstant(state: WithConstants, name: string): number {
    const result = state.constants.get(name);
    if (result === undefined) {
        throw new Error(`missing constant value: ${name}`);
    }
    return result;
}
interface WithConstants {
    constants: Map<string, number>;
}

export function setConstant(state: WithConstants, name: string, value: number) {
    state.constants.set(name, value);
}

export class MultiMap<K, V> extends Map<K, Array<V>> {
    push(k: K, ...v: V[]) {
        let arr = this.get(k);
        if (!arr) {
            arr = [];
            this.set(k, arr);
        }
        arr.push(...v);
    }
}
