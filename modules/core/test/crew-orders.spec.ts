import { CrewOrdersManager, crewOrderCommands, demoShip, makeShipState, orderParams } from '../src';
import { Decoder, Encoder } from '@colyseus/schema';
import { expect } from 'chai';

const { issueOrder, revokeOrder, reportOrderProgress } = crewOrderCommands;

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
            issuer: 'captain',
        });
        expect(slot('maneuver')).to.equal(undefined);
        tick();
        const o = slot('maneuver')!;
        expect([o.kind, o.issuer, o.issuedAt, o.status, o.id]).to.eql(['close_to', 'captain', 1, 'active', 1]);
        expect(orderParams(o.params)).to.eql({ target: { name: 'raider', position: { x: 1, y: 2 } }, range: 2000 });
    });

    it('refuses unknown kinds, unknown issuers, foreign or mistyped params and missing required ones', () => {
        const { state, tick } = ship();
        const bad: unknown[] = [
            { kind: 'self_destruct', issuer: 'captain' },
            { kind: 'hold_here', issuer: 'gm' },
            { kind: 'hold_here', issuer: 'captain', params: { range: 5 } },
            { kind: 'close_to', issuer: 'captain', params: { target: { name: 'x' }, range: Number.NaN } },
            { kind: 'close_to', issuer: 'captain', params: { target: { name: 'x' } } },
            { kind: 'dock_below_armor', issuer: 'captain', params: { station: { name: 'd' }, threshold: 2 } },
            { kind: 'engage', issuer: 'captain', params: { target: { position: { x: 'a', y: 0 } } } },
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
            issueOrder.setValue(state, { kind: 'salvo', params: { count }, issuer: 'captain' } as never);
        }
        tick();
        expect(state.orderBoard.slots.size).to.equal(0);
        issueOrder.setValue(state, { kind: 'salvo', params: { count: 2 }, issuer: 'captain' });
        tick();
        expect(slot('stance')?.kind).to.equal('salvo');
        expect(orderParams(slot('stance')!.params)).to.eql({ count: 2 });
    });

    it('revokes contradicted orders, ignores a repeat, and revokes a slot', () => {
        const { state, tick, slot } = ship();
        issueOrder.setValue(state, { kind: 'engage', params: { target: { name: 'r' } }, issuer: 'captain' });
        issueOrder.setValue(state, { kind: 'engage', params: { target: { name: 'r' } }, issuer: 'captain' });
        tick();
        expect(state.orderBoard.issued).to.equal(1);
        issueOrder.setValue(state, { kind: 'all_out', issuer: 'captain' });
        issueOrder.setValue(state, { kind: 'preserve_energy', issuer: 'captain' });
        tick();
        expect(slot('stance')).to.equal(undefined);
        expect(slot('energy')!.kind).to.equal('preserve_energy');
        revokeOrder.setValue(state, { slot: 'energy', issuer: 'captain' });
        tick();
        expect(slot('energy')).to.equal(undefined);
    });

    it('never lets doctrine replace or revoke a captain order; a captain order replaces doctrine', () => {
        const { state, tick, slot } = ship();
        issueOrder.setValue(state, { kind: 'hold_here', issuer: 'doctrine', origin: 'signals' });
        tick();
        expect([slot('maneuver')!.issuer, slot('maneuver')!.origin]).to.eql(['doctrine', 'signals']);
        issueOrder.setValue(state, { kind: 'hold_position', issuer: 'captain' });
        tick();
        issueOrder.setValue(state, {
            kind: 'close_to',
            params: { target: { name: 'r' }, range: 1 },
            issuer: 'doctrine',
        });
        revokeOrder.setValue(state, { slot: 'navigation', issuer: 'doctrine' });
        tick();
        expect(slot('navigation')!.kind).to.equal('hold_position');
        expect(slot('maneuver')!.kind).to.equal('hold_here');
    });

    it('takes progress reports for the order on the board, stamping step changes', () => {
        const { state, tick, slot } = ship();
        issueOrder.setValue(state, { kind: 'dock_for_repair', params: { station: { name: 'd' } }, issuer: 'captain' });
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
        issueOrder.setValue(state, { kind: 'offensive', issuer: 'captain', origin: 'branch' });
        issueOrder.setValue(state, {
            kind: 'patrol',
            params: { region: { name: 'n', position: { x: 5, y: 6 }, radius: 3000 } },
            issuer: 'captain',
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
