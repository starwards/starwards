export type StateValue<T extends StatesToggle<string>> = T extends StatesToggle<infer S> ? S : never;
export class StatesToggle<S extends string> {
    private readonly states: ReadonlyArray<S>;
    private readonly legalStates: Set<S>;
    constructor(private state: S, ...states: Array<S>) {
        this.states = [this.state, ...states];
        this.legalStates = new Set(this.states);
    }

    isState(s: S) {
        return this.state === s;
    }

    // move to another state, even if it is not legal
    private innerToggleState(direction: boolean) {
        const directionNumber = direction ? 1 : -1;
        const nextStateIdx = (this.states.indexOf(this.state) + directionNumber) % this.states.length;
        this.state = this.states[nextStateIdx];
    }

    toggleState() {
        this.innerToggleState(true);
        while (!this.legalStates.has(this.state)) {
            this.innerToggleState(true);
        }
    }

    setLegalState(state: S, legal: boolean) {
        if (legal) {
            this.legalStates.add(state);
        } else {
            if (this.legalStates.size === 1 && this.legalStates.has(state)) {
                throw new Error(`no legal states`);
            }
            this.legalStates.delete(state);
            while (!this.legalStates.has(this.state)) {
                this.innerToggleState(false);
            }
        }
    }

    toString() {
        return this.state;
    }
}
