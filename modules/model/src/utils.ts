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
