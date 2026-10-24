import {
    Asteroid,
    Explosion,
    Faction,
    Projectile,
    SpaceObject,
    SpaceState,
    Spaceship,
    Vec2,
    compareSpaceObjects,
    uniqueId,
} from '../src';

import { expect } from 'chai';

const fieldSize = 80000;
const map = Array(100)
    .fill(null)
    .map<SpaceObject>(() =>
        new Asteroid().init(
            uniqueId(''),
            new Vec2(Math.random() * fieldSize - fieldSize / 2, Math.random() * fieldSize - fieldSize / 2),
        ),
    );
map.push(new Spaceship().init(uniqueId(''), new Vec2(0, 0), 'demo-ship', Faction.NONE));

describe('SpaceState', () => {
    it('iterator has same number of elements', () => {
        const uut = new SpaceState(false);
        map.forEach((o) => uut.set(o));
        expect([...uut].length).to.equal(map.length);
    });
    it('iterator has the same elements', () => {
        const uut = new SpaceState(false);
        map.forEach((o) => uut.set(o));
        expect([...uut].sort(compareSpaceObjects)).to.eql(map.sort(compareSpaceObjects));
    });
    describe('iteration order and liveness (simulation determinism depends on them)', () => {
        const at = () => new Vec2(0, 0);
        function populated() {
            const uut = new SpaceState(false);
            const ship = new Spaceship().init('ship', at(), 'demo-ship', Faction.NONE);
            const rock = new Asteroid().init('rock', at());
            const shell = new Projectile().init('shell', at());
            const blast = new Explosion().init('blast', at(), 1);
            [ship, rock, shell, blast].forEach((o) => uut.set(o));
            return { uut, ship, rock, shell, blast };
        }
        it('visits maps in type order, then insertion order', () => {
            const { uut } = populated();
            uut.set(new Asteroid().init('rock2', at()));
            expect([...uut].map((o) => o.id)).to.eql(['shell', 'blast', 'rock', 'rock2', 'ship']);
        });
        it('skips destroyed objects, or yields only them when asked', () => {
            const { uut, rock } = populated();
            rock.destroyed = true;
            expect([...uut].map((o) => o.id)).to.eql(['shell', 'blast', 'ship']);
            expect([...uut[Symbol.iterator](true)].map((o) => o.id)).to.eql(['rock']);
            expect([...uut.getAll('Asteroid')]).to.eql([]);
        });
        it('reads destroyed at the moment each object is reached', () => {
            const { uut, ship } = populated();
            const seen: string[] = [];
            for (const o of uut) {
                seen.push(o.id);
                if (o.id === 'shell') ship.destroyed = true;
            }
            expect(seen).to.eql(['shell', 'blast', 'rock']);
        });
        it('visits objects inserted during iteration into a map not yet finished', () => {
            const { uut } = populated();
            const seen: string[] = [];
            for (const o of uut) {
                seen.push(o.id);
                if (o.id === 'blast') {
                    uut.set(new Asteroid().init('late-rock', at()));
                    uut.set(new Projectile().init('late-shell', at()));
                }
            }
            expect(seen).to.eql(['shell', 'blast', 'rock', 'late-rock', 'ship']);
        });
        it('getAll is re-iterable and live', () => {
            const { uut } = populated();
            const rocks = uut.getAll('Asteroid');
            expect([...rocks].map((o) => o.id)).to.eql(['rock']);
            uut.set(new Asteroid().init('rock2', at()));
            expect([...rocks].map((o) => o.id)).to.eql(['rock', 'rock2']);
        });
    });
});
