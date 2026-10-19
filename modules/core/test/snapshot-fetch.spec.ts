import { NeedSnapshotMessage, SnapshotFetch, SnapshotMessage } from '../src';

import { expect } from 'chai';

function setup() {
    const sent: NeedSnapshotMessage[] = [];
    let now = 0;
    const fetch = new SnapshotFetch(
        (msg) => sent.push(msg),
        () => now,
        1000,
    );
    return {
        sent,
        fetch,
        advance: (ms: number) => {
            now += ms;
        },
    };
}

function reply(targetId: string, capturedAt: number, ageSeconds = 0): SnapshotMessage {
    return { targetId, capturedAt, ageSeconds, data: new Uint8Array([1, 2, 3]) };
}

describe('SnapshotFetch', () => {
    it('polls on an interval while the subject has a newer snapshot than held', () => {
        const { sent, fetch, advance } = setup();
        fetch.update('t1', 42);
        advance(500);
        fetch.update('t1', 42);
        advance(600);
        fetch.update('t1', 42);

        expect(sent).to.deep.equal([{ targetId: 't1' }, { targetId: 't1' }]);
        expect(fetch.snapshot).to.equal(undefined);
    });

    it('does not poll when no snapshot was ever captured', () => {
        const { sent, fetch } = setup();
        fetch.update('t1', 0);
        expect(sent).to.deep.equal([]);
    });

    it('stops polling once the reply arrives, and exposes it', () => {
        const { sent, fetch, advance } = setup();
        fetch.update('t1', 42);
        fetch.receive(reply('t1', 42));
        advance(5000);
        fetch.update('t1', 42);

        expect(sent).to.have.length(1);
        expect(fetch.snapshot?.capturedAt).to.equal(42);
    });

    it('drops a reply for a target that is no longer the subject', () => {
        const { fetch } = setup();
        fetch.update('t1', 42);
        fetch.update('t2', 50);
        fetch.receive(reply('t1', 42));

        expect(fetch.snapshot).to.equal(undefined);
    });

    it('asks again, naming what it holds, after a newer capture', () => {
        const { sent, fetch, advance } = setup();
        fetch.update('t1', 42);
        fetch.receive(reply('t1', 42));
        advance(5000);
        fetch.update('t1', 60);

        expect(sent[1]).to.deep.equal({ targetId: 't1', haveCapturedAt: 42 });
        expect(fetch.snapshot).to.equal(undefined); // the held one is stale
    });

    it('tolerates float32 rounding of the synced capture stamp', () => {
        const { sent, fetch } = setup();
        fetch.update('t1', Math.fround(42.1));
        fetch.receive(reply('t1', 42.1));
        fetch.update('t1', Math.fround(42.1));

        expect(sent).to.have.length(1);
        expect(fetch.snapshot?.capturedAt).to.equal(42.1);
    });

    it('ages the held snapshot by local time since receipt', () => {
        const { fetch, advance } = setup();
        fetch.update('t1', 42);
        fetch.receive(reply('t1', 42, 8));
        advance(2000);

        expect(fetch.snapshot?.ageSeconds).to.equal(10);
    });

    it('shows nothing without a subject', () => {
        const { sent, fetch } = setup();
        fetch.update('t1', 42);
        fetch.receive(reply('t1', 42));
        fetch.update(undefined, 0);

        expect(fetch.snapshot).to.equal(undefined);
        expect(sent).to.have.length(1);
    });
});
