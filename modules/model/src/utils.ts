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

export type Destructor = () => unknown;
export class Destructors {
    private _destroyed = false;
    private destructors = new Set<Destructor>();

    get destroyed() {
        return this._destroyed;
    }

    add = (d: Destructor) => {
        if (this._destroyed) {
            throw new Error('ading destructor to destroyed state');
        } else {
            this.destructors.add(d);
        }
    };

    /**
     * cleans up and invalidates state
     */
    destroy = () => {
        if (!this._destroyed) {
            this.cleanup();
            this._destroyed = true;
        }
    };

    /**
     * cleans up and keep state valid
     */
    cleanup = () => {
        if (this._destroyed) {
            throw new Error('cleaning up a destroyed state');
        }
        for (const destructor of this.destructors) {
            destructor();
        }
        this.destructors.clear();
    };
}
