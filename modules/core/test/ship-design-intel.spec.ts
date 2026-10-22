import {
    Faction,
    LiveShipIntel,
    ScanLevel,
    ShipDriver,
    ShipIntelSource,
    ShipState,
    SnapshotMessage,
    Spaceship,
    Vec2,
    decodeShipSnapshot,
    encodeShipSnapshot,
    makeShipState,
    shipConfigurations,
    shipDesignIntel,
    targetIntel,
} from '../src';

import { expect } from 'chai';

const PLAYER = Faction.Gravitas;

function setup(level: ScanLevel) {
    const subject = new Spaceship().init('target', Vec2.make({ x: 0, y: 0 }), 'dragonfly-MK1', Faction.Raiders);
    subject.scanLevels[Number(PLAYER)] = level;
    const live = makeShipState('target', shipConfigurations['dragonfly-MK1']);
    let snapshot: { state: ShipState; ageSeconds: number } | undefined;
    const source: ShipIntelSource = {
        live: (ship) => (ship.id === 'target' ? live : undefined),
        snapshot: (ship) => (ship.id === 'target' ? snapshot : undefined),
    };
    const freeze = (ageSeconds = 5) => {
        snapshot = { state: decodeShipSnapshot(encodeShipSnapshot(live)), ageSeconds };
    };
    return { subject, live, source, freeze };
}

describe('shipDesignIntel', () => {
    it('reports the model, design facts and every armor plate with its layers', () => {
        const state = makeShipState('target', shipConfigurations['dragonfly-MK1']);
        state.armor.armorPlates[1].layers[0].health = 0;
        const intel = shipDesignIntel(state);

        expect(intel.model).to.equal(state.design.modelName);
        expect(intel.systemKillRatio).to.equal(state.design.systemKillRatio);
        expect(intel.tubes).to.equal(state.tubes.length);
        expect(intel.chainGuns).to.equal(state.chainGuns.length);
        expect(intel.armor.numberOfPlates).to.equal(state.armor.numberOfPlates);
        expect(intel.armor.degreesPerPlate).to.equal(state.armor.degreesPerPlate);
        expect(intel.armor.plates).to.have.length(state.armor.numberOfPlates);
        expect(intel.armor.layers.map((l) => l.model)).to.deep.equal(
            [...state.armor.armorPlates[0].layers].map((l) => l.design.modelName),
        );
        expect(intel.armor.plates[1].layers[0].health).to.equal(0);
        expect(intel.armor.plates[0].healthRatio).to.equal(1);
        expect(intel.armor.plates[1].healthRatio).to.be.lessThan(1);
    });
});

describe('targetIntel gating', () => {
    it('reveals nothing at UFO', () => {
        const { subject, source, freeze } = setup(ScanLevel.UFO);
        freeze();
        const intel = targetIntel(subject, PLAYER, source);
        expect(intel.intel).to.equal('NONE');
        expect(intel.design).to.equal(undefined);
    });

    it('reveals nothing at BASIC', () => {
        const { subject, source, freeze } = setup(ScanLevel.BASIC);
        freeze();
        const intel = targetIntel(subject, PLAYER, source);
        expect(intel.intel).to.equal('NONE');
        expect(intel.design).to.equal(undefined);
    });

    it('reveals the live design and armor at FULL', () => {
        const { subject, live, source } = setup(ScanLevel.FULL);
        live.armor.armorPlates[0].layers[0].health = 3;
        const intel = targetIntel(subject, PLAYER, source);
        expect(intel.intel).to.equal('LIVE');
        expect(intel.design?.armor.plates[0].layers[0].health).to.equal(3);

        live.armor.armorPlates[0].layers[0].health = 1;
        expect(targetIntel(subject, PLAYER, source).design?.armor.plates[0].layers[0].health).to.equal(1);
    });

    it('reveals the snapshot design and armor at SNAPSHOT, frozen at capture', () => {
        const { subject, live, source, freeze } = setup(ScanLevel.SNAPSHOT);
        live.armor.armorPlates[0].layers[0].health = 7;
        freeze(12);
        live.armor.armorPlates[0].layers[0].health = 1;

        const intel = targetIntel(subject, PLAYER, source);
        expect(intel.intel).to.equal('SNAPSHOT');
        expect(intel.ageSeconds).to.equal(12);
        expect(intel.design?.armor.plates[0].layers[0].health).to.equal(7);
    });

    it('does not fall back to live state at SNAPSHOT before the snapshot arrives', () => {
        const { subject, source } = setup(ScanLevel.SNAPSHOT);
        const intel = targetIntel(subject, PLAYER, source);
        expect(intel.intel).to.equal('PENDING');
        expect(intel.design).to.equal(undefined);
    });

    it('reports no target for a missing subject', () => {
        const { source } = setup(ScanLevel.FULL);
        expect(targetIntel(undefined, PLAYER, source)).to.deep.equal({ intel: 'NONE' });
    });
});

describe('LiveShipIntel', () => {
    it('serves the live state once the target room is joined', async () => {
        const { subject, live } = setup(ScanLevel.FULL);
        const joined: string[] = [];
        const source = new LiveShipIntel(
            (id) => {
                joined.push(id);
                return Promise.resolve({ state: live } as ShipDriver);
            },
            { needSnapshot: () => undefined, onSnapshot: () => () => undefined },
        );
        expect(source.live(subject)).to.equal(undefined);
        await Promise.resolve();
        expect(source.live(subject)).to.equal(live);
        expect(joined).to.deep.equal(['target']);
    });

    it('requests the faction snapshot and serves it decoded', () => {
        const { subject, live } = setup(ScanLevel.SNAPSHOT);
        live.armor.armorPlates[0].layers[0].health = 4;
        subject.scanSnapshotCapturedAt[Number(PLAYER)] = 30;
        let deliver: (msg: SnapshotMessage) => void = () => undefined;
        const requested: string[] = [];
        const source = new LiveShipIntel(() => Promise.reject(new Error('no live join at SNAPSHOT')), {
            needSnapshot: (msg) => requested.push(msg.targetId),
            onSnapshot: (cb) => {
                deliver = cb;
                return () => undefined;
            },
        });
        expect(source.snapshot(subject, PLAYER)).to.equal(undefined);
        expect(requested).to.deep.equal(['target']);
        deliver({ targetId: 'target', capturedAt: 30, ageSeconds: 2, data: encodeShipSnapshot(live) });
        live.armor.armorPlates[0].layers[0].health = 1;

        const intel = targetIntel(subject, PLAYER, source);
        expect(intel.intel).to.equal('SNAPSHOT');
        expect(intel.design?.armor.plates[0].layers[0].health).to.equal(4);
    });
});
