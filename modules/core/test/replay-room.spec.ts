import {
    AdminState,
    ReplayRoom,
    ShipDriver,
    ShipState,
    SpaceDriver,
    SpaceState,
    Spaceship,
    demoShip,
    makeShipState,
} from '../src';
import { expect } from 'chai';

function frame(ships: Record<string, number>) {
    const space = new SpaceState();
    for (const [id, x] of Object.entries(ships)) {
        const ship = new Spaceship();
        ship.id = id;
        ship.position.x = x;
        space.set(ship);
    }
    return space;
}

describe('ReplayRoom', () => {
    it('drives a real SpaceDriver, firing events as a server would', async () => {
        const room = new ReplayRoom(SpaceState);
        const driverPromise = SpaceDriver(room as never);
        room.apply(frame({ s1: 0, s2: 5 }));
        const driver = await driverPromise;
        const events: string[] = [];
        const on = driver.events.on.bind(driver.events) as (name: string, cb: (e: never) => void) => void;
        on('/Spaceship/s1/position/x', (e: { value: number }) => events.push(`x=${e.value}`));
        on('$remove', (e: { path: string }) => events.push(`remove ${e.path}`));
        on('$add', (e: { path: string }) => events.push(`add ${e.path}`));
        expect(driver.state.get('s2')).to.not.equal(undefined);

        room.apply(frame({ s1: 100 }));
        expect(driver.state.get('s1')?.position.x).to.equal(100);
        expect(driver.state.get('s2')).to.equal(undefined);
        expect(events).to.include('x=100');
        expect(events.some((e) => e.startsWith('remove') && e.includes('s2'))).to.equal(true);

        events.length = 0;
        room.apply(frame({ s1: 0, s2: 5 }));
        expect(driver.state.get('s2')?.position.x).to.equal(5);
        expect(events.some((e) => e.startsWith('add') && e.includes('s2'))).to.equal(true);
    });

    it('drives a real ShipDriver, whose state starts out empty', async () => {
        const room = new ReplayRoom(ShipState);
        const driverPromise = ShipDriver(room as never);
        const first = makeShipState('a', demoShip);
        room.apply(first);
        const driver = await driverPromise;
        expect(driver.state.id).to.equal('a');
        const heard: unknown[] = [];
        (driver.events.on.bind(driver.events) as (name: string, cb: (e: { value: unknown }) => void) => void)(
            '/spaceship/position/x',
            (e) => heard.push(e.value),
        );

        const second = makeShipState('a', demoShip);
        second.spaceship.position.x = 42;
        room.apply(second);
        expect(driver.state.spaceship.position.x).to.equal(42);
        expect(heard).to.include(42);
    });

    it('accepts admin state', () => {
        const room = new ReplayRoom(AdminState);
        const admin = new AdminState();
        admin.shipIds.push('a');
        room.apply(admin);
        expect(room.state.shipIds.length).to.equal(1);
    });
});
