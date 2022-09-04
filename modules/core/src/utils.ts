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
        for (const destructor of this.destructors) {
            destructor();
        }
        this.destructors.clear();
    };
}

export async function waitFor<T>(body: () => T | Promise<T>, timeout: number, interval = 20): Promise<T> {
    let error: unknown = new Error('timeout is not a positive number');
    while (timeout > 0) {
        const startTime = Date.now();
        try {
            return await body();
        } catch (e) {
            error = e;
        }
        await new Promise<void>((res) => void setTimeout(res, interval));
        timeout -= Date.now() - startTime;
    }
    throw error;
}
