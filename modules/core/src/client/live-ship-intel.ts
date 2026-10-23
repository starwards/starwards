import { Faction, Spaceship } from '../space';
import { ShipState, decodeShipSnapshot } from '../ship';

import { ShipDriver } from './ship';
import { ShipIntelSource } from './space-object-intel';
import { SnapshotFetch } from './snapshot-fetch';

/**
 * A `ShipIntelSource` over a running game: live states come from joining the target's ship room,
 * snapshots from the observing ship's room (SPEC-0008 fetch). Reads never block — a source not yet
 * delivered reads as undefined and arrives on a later read. Tracks one snapshot subject at a time.
 */
export class LiveShipIntel implements ShipIntelSource {
    private readonly liveStates = new Map<string, ShipState>();
    private readonly joining = new Set<string>();
    private readonly fetches = new Map<string, SnapshotFetch>();
    private readonly decoded = new Map<string, { data: Uint8Array; state: ShipState }>();
    /** stops listening for snapshot replies */
    readonly dispose: () => void;
    private readonly send: ShipDriver['needSnapshot'];

    constructor(
        private readonly getShipDriver: (shipId: string) => Promise<ShipDriver>,
        observer: Pick<ShipDriver, 'needSnapshot' | 'onSnapshot'>,
    ) {
        this.send = (msg) => observer.needSnapshot(msg);
        this.dispose = observer.onSnapshot((msg) => this.fetches.get(msg.targetId)?.receive(msg));
    }

    live(ship: Spaceship): ShipState | undefined {
        const state = this.liveStates.get(ship.id);
        if (!state && !this.joining.has(ship.id)) {
            this.joining.add(ship.id);
            void this.getShipDriver(ship.id).then(
                (d) => this.liveStates.set(ship.id, d.state),
                () => this.joining.delete(ship.id),
            );
        }
        return state;
    }

    snapshot(ship: Spaceship, faction: Faction) {
        let fetch = this.fetches.get(ship.id);
        if (!fetch) {
            fetch = new SnapshotFetch(this.send);
            this.fetches.set(ship.id, fetch);
        }
        fetch.update(ship.id, ship.scanSnapshotCapturedAt[Number(faction)] ?? 0);
        const snapshot = fetch.snapshot;
        if (!snapshot) return undefined;
        let decoded = this.decoded.get(ship.id);
        if (decoded?.data !== snapshot.data) {
            decoded = { data: snapshot.data, state: decodeShipSnapshot(snapshot.data) };
            this.decoded.set(ship.id, decoded);
        }
        return { state: decoded.state, ageSeconds: snapshot.ageSeconds };
    }
}
