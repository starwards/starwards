import { CrewOrdersManager, crewOrderCommands, demoShip, makeShipState, orderParams } from '../src';
import { Decoder, Encoder } from '@colyseus/schema';
import { expect } from 'chai';

const { issueOrder, revokeOrder, setStance, doctrineIssueOrder, doctrineRevokeOrder, reportOrderProgress } =
    crewOrderCommands;

function ship() {
    const state = makeShipState('ship', demoShip);
    const manager = new CrewOrdersManager(state.orderBoard);
    let t = 0;
    const tick = () => manager.update({ deltaSeconds: 1, deltaSecondsAvg: 1, totalSeconds: ++t });
    const slot = (s: string) => state.orderBoard.slots.get(s);
    return { state, tick, slot };
}

describe('crew order board', () => {
    it('applies an order only at the manager update, stamped with board seconds', () => {
        const { state, tick, slot } = ship();
        issueOrder.setValue(state, {
            kind: 'close_to',
            params: { target: { name: 'raider', position: { x: 1, y: 2 } }, range: 2000 },
        });
        expect(slot('maneuver')).to.equal(undefined);
        tick();
        const o = slot('maneuver')!;
        expect([o.kind, o.issuer, o.issuedAt, o.status, o.id]).to.eql(['close_to', 'captain', 1, 'active', 1]);
        expect(orderParams(o.params)).to.eql({ target: { name: 'raider', position: { x: 1, y: 2 } }, range: 2000 });
    });

    it('refuses unknown kinds, foreign or mistyped params and missing required ones', () => {
        const { state, tick } = ship();
        const bad: unknown[] = [
            { kind: 'self_destruct' },
            { kind: 'offensive' },
            { kind: 'hold_here', params: { range: 5 } },
            { kind: 'close_to', params: { target: { name: 'x' }, range: Number.NaN } },
            { kind: 'close_to', params: { target: { name: 'x' } } },
            { kind: 'dock_below_armor', params: { station: { name: 'd' }, threshold: 2 } },
            { kind: 'engage', params: { target: { position: { x: 'a', y: 0 } } } },
            null,
        ];
        for (const b of bad) issueOrder.setValue(state, b as never);
        tick();
        expect(state.orderBoard.slots.size).to.equal(0);
        expect(state.orderBoard.issued).to.equal(0);
    });

    it('places a salvo with a whole missile count in the stance slot, and refuses any other count', () => {
        const { state, tick, slot } = ship();
        for (const count of [0, 1.5, -2, undefined]) {
            setStance.setValue(state, { kind: 'salvo', params: { count } });
        }
        tick();
        expect(state.orderBoard.slots.size).to.equal(0);
        setStance.setValue(state, { kind: 'salvo', params: { count: 2 } });
        tick();
        expect(slot('stance')?.kind).to.equal('salvo');
        expect(orderParams(slot('stance')!.params)).to.eql({ count: 2 });
    });

    it('places a focus with an ordered list or a pick rule in the engagement slot, refusing one with neither', () => {
        const { state, tick, slot } = ship();
        const bad: unknown[] = [
            { kind: 'focus' },
            { kind: 'focus', params: { targets: [] } },
            { kind: 'focus', params: { pick: 'weakest' } },
            { kind: 'focus', params: { pick: 'nearest_to' } },
        ];
        for (const b of bad) issueOrder.setValue(state, b as never);
        tick();
        expect(state.orderBoard.slots.size).to.equal(0);
        issueOrder.setValue(state, {
            kind: 'focus',
            params: { targets: [{ name: 'raider-2' }, { name: 'raider-1' }] },
        });
        tick();
        expect(orderParams(slot('engagement')!.params)).to.eql({
            targets: [{ name: 'raider-2' }, { name: 'raider-1' }],
        });
        issueOrder.setValue(state, {
            kind: 'focus',
            params: { pick: 'nearest_to', station: { name: 'Small Station' } },
        });
        tick();
        expect(orderParams(slot('engagement')!.params)).to.eql({
            pick: 'nearest_to',
            station: { name: 'Small Station' },
        });
    });

    it('revokes contradicted orders, ignores a repeat, and revokes a slot', () => {
        const { state, tick, slot } = ship();
        issueOrder.setValue(state, { kind: 'engage', params: { target: { name: 'r' } } });
        issueOrder.setValue(state, { kind: 'engage', params: { target: { name: 'r' } } });
        tick();
        expect(state.orderBoard.issued).to.equal(1);
        setStance.setValue(state, { kind: 'all_out' });
        issueOrder.setValue(state, { kind: 'preserve_energy' });
        tick();
        expect(slot('stance')).to.equal(undefined);
        expect(slot('energy')!.kind).to.equal('preserve_energy');
        revokeOrder.setValue(state, { slot: 'energy' });
        tick();
        expect(slot('energy')).to.equal(undefined);
    });

    it('never lets doctrine replace or revoke a captain order; a captain order replaces doctrine', () => {
        const { state, tick, slot } = ship();
        doctrineIssueOrder.setValue(state, { kind: 'hold_here', origin: 'signals' });
        tick();
        expect([slot('maneuver')!.issuer, slot('maneuver')!.origin]).to.eql(['doctrine', 'signals']);
        issueOrder.setValue(state, { kind: 'hold_position' });
        tick();
        doctrineIssueOrder.setValue(state, { kind: 'close_to', params: { target: { name: 'r' }, range: 1 } });
        doctrineRevokeOrder.setValue(state, { slot: 'navigation' });
        tick();
        expect(slot('navigation')!.kind).to.equal('hold_position');
        expect(slot('maneuver')!.kind).to.equal('hold_here');
    });

    it('derives the issuer from the command, ignoring any issuer the sender names', () => {
        const { state, tick, slot } = ship();
        issueOrder.setValue(state, { kind: 'hold_here', issuer: 'doctrine' } as never);
        doctrineIssueOrder.setValue(state, { kind: 'hold_position', issuer: 'captain' } as never);
        setStance.setValue(state, { kind: 'defensive', issuer: 'doctrine' } as never);
        tick();
        expect(slot('maneuver')!.issuer).to.equal('captain');
        expect(slot('navigation')!.issuer).to.equal('doctrine');
        expect(slot('stance')!.issuer).to.equal('captain');
        doctrineRevokeOrder.setValue(state, { slot: 'maneuver', issuer: 'captain' } as never);
        doctrineIssueOrder.setValue(state, {
            kind: 'close_to',
            params: { target: { name: 'r' }, range: 1 },
            issuer: 'captain',
        } as never);
        tick();
        expect(slot('maneuver')!.kind).to.equal('hold_here');
    });

    it('sets the stance slot only through setStance, a new stance replacing the old', () => {
        const { state, tick, slot } = ship();
        issueOrder.setValue(state, { kind: 'defensive' });
        doctrineIssueOrder.setValue(state, { kind: 'chase' });
        setStance.setValue(state, { kind: 'hold_here' });
        tick();
        expect(state.orderBoard.issued).to.equal(0);
        setStance.setValue(state, { kind: 'defensive' });
        tick();
        setStance.setValue(state, { kind: 'chase' });
        tick();
        expect([slot('stance')!.kind, state.orderBoard.slots.size]).to.eql(['chase', 1]);
    });

    it('keeps undock an order kind, in the navigation slot', () => {
        const { state, tick, slot } = ship();
        issueOrder.setValue(state, { kind: 'undock' });
        tick();
        expect([slot('navigation')!.kind, slot('navigation')!.issuer]).to.eql(['undock', 'captain']);
    });

    it('takes progress reports for the order on the board, stamping step changes', () => {
        const { state, tick, slot } = ship();
        issueOrder.setValue(state, { kind: 'dock_for_repair', params: { station: { name: 'd' } } });
        tick();
        const id = slot('navigation')!.id;
        reportOrderProgress.setValue(state, { id, step: 'docked', status: 'complete', note: 'docked, repairing' });
        reportOrderProgress.setValue(state, { id: id + 7, status: 'aborted' });
        tick();
        tick();
        reportOrderProgress.setValue(state, { id, status: 'aborted' });
        tick();
        const o = slot('navigation')!;
        expect([o.step, o.stepAt, o.status, o.note]).to.eql(['docked', 2, 'complete', 'docked, repairing']);
    });

    it('reaches a client mirror through encode/decode', () => {
        const { state, tick } = ship();
        const encoder = new Encoder(state);
        const mirror = makeShipState('ship', demoShip);
        const decoder = new Decoder(mirror);
        decoder.decode(encoder.encodeAll());
        setStance.setValue(state, { kind: 'offensive', origin: 'branch' });
        issueOrder.setValue(state, {
            kind: 'patrol',
            params: { region: { name: 'n', position: { x: 5, y: 6 }, radius: 3000 } },
        });
        tick();
        decoder.decode(encoder.encode());
        expect(mirror.orderBoard.slots.get('stance')!.origin).to.equal('branch');
        expect(orderParams(mirror.orderBoard.slots.get('navigation')!.params)).to.eql({
            region: { name: 'n', position: { x: 5, y: 6 }, radius: 3000 },
        });
        expect(mirror.orderBoard.seconds).to.equal(1);
    });
});
