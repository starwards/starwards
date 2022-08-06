export class StatesToggle<S> {
    private readonly states: ReadonlyArray<S>;
    private readonly legalStates: Set<S>;
    constructor(private callBack: (s: S) => unknown, private state: S, ...states: Array<S>) {
        this.states = [this.state, ...states];
        this.legalStates = new Set(this.states);
        this.state = this.states[0];
        this.callBack(this.state);
    }

    isState(s: S) {
        return this.state === s;
    }

    // move to another state, even if it is not legal
    private innerToggleState(direction: boolean) {
        const directionNumber = direction ? 1 : -1;
        const nextStateIdx = (this.states.indexOf(this.state) + directionNumber) % this.states.length;
        this.state = this.states[nextStateIdx];
        this.callBack(this.state);
    }

    toggleState() {
        this.innerToggleState(true);
        while (!this.legalStates.has(this.state)) {
            this.innerToggleState(true);
        }
        this.callBack(this.state);
    }

    setLegalState(state: S, legal: boolean) {
        if (legal) {
            this.legalStates.add(state);
        } else {
            if (this.legalStates.size === 1 && this.legalStates.has(state)) {
                throw new Error(`no legal states`);
            }
            this.legalStates.delete(state);
            if (!this.legalStates.has(this.state)) {
                this.toggleState();
            }
        }
    }

    getState() {
        return this.state;
    }

    toString() {
        return this.state;
    }
}
