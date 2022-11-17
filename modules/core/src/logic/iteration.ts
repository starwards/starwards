export class Iterator<T> implements Iterable<T> {
    constructor(private elements: Iterable<T>) {}

    *[Symbol.iterator]() {
        for (const e of this.elements) yield e;
    }

    add<S>(...values: S[]) {
        const arg = {
            elements: this.elements,
            values,
            *[Symbol.iterator]() {
                yield* this.elements;
                yield* this.values;
            },
        };
        return new Iterator<T | S>(arg);
    }

    filter<S extends T>(predicate: (value: T) => value is S): Iterator<S>;
    filter(predicate: (value: T) => unknown): Iterator<T>;
    filter<S extends T>(predicate: (value: T) => unknown) {
        const arg = {
            elements: this.elements,
            predicate,
            *[Symbol.iterator]() {
                for (const e of this.elements) if (this.predicate(e)) yield e as S;
            },
        };
        return new Iterator<S>(arg);
    }

    map<U>(callbackfn: (value: T) => U) {
        const arg = {
            elements: this.elements,
            callbackfn,
            *[Symbol.iterator]() {
                for (const e of this.elements) yield this.callbackfn(e);
            },
        };
        return new Iterator<U>(arg);
    }

    repeat(times: number) {
        const arg = {
            elements: this.elements,
            times,
            *[Symbol.iterator]() {
                for (let i = 0; i < this.times; i++) yield* this.elements;
            },
        };
        return new Iterator<T>(arg);
    }

    allAfter(current: T) {
        const arg = {
            elements: this.elements,
            current,
            *[Symbol.iterator]() {
                let currentFound = false;
                for (const e of this.elements) {
                    if (!currentFound && e === this.current) {
                        currentFound = true;
                    } else if (currentFound) {
                        yield e;
                    }
                }
            },
        };
        return new Iterator<T>(arg);
    }

    allBefore(current: T) {
        const arg = {
            elements: this.elements,
            current,
            *[Symbol.iterator]() {
                for (const e of this.elements) {
                    if (e === this.current) {
                        return;
                    }
                    yield e;
                }
            },
        };
        return new Iterator<T>(arg);
    }

    firstOr<S>(defaultValue: S) {
        for (const e of this.elements) return e;
        return defaultValue;
    }

    lastOr<S>(defaultValue: S) {
        let result: S | T = defaultValue;
        for (const e of this.elements) result = e;
        return result;
    }

    elementAfter(current: T) {
        return this.allAfter(current).firstOr(this.firstOr(current));
    }

    elementBefore(current: T) {
        let latest = current;
        let goToLast = false;
        for (const e of this.elements) {
            if (goToLast || e !== current) {
                latest = e;
            } else {
                if (latest === current) {
                    // current is the first element, return the last element
                    goToLast = true;
                } else {
                    return latest;
                }
            }
        }
        return latest;
    }
}