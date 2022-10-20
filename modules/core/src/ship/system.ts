import { Schema } from '@colyseus/schema';

export abstract class DesignState extends Schema {
    keys() {
        return Object.keys(this.$changes.indexes);
    }
}
