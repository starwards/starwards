import { expect, plan } from '@starwards/test-kit';
import { Ticker } from '../src/BL/ticker';

function delay(time: number) {
    return new Promise(resolve => setTimeout(resolve, time));
}

async function expectUnresolvedIteration(i: AsyncIterableIterator<null>) {
    const res = await Promise.race([
        i.next(),
        delay(20).then(() => 'time!')
    ]);
    expect(res).to.eql('time!');
}

describe(`server`, () => {
  describe(`ticker`, () => {
    let uut: Ticker;
    beforeEach(() => {
      uut = new Ticker();
    });
    it(`no ticks means no next iteration`, plan(1, async () => {
        await expectUnresolvedIteration(uut.listen());
    }));

    it(`a tick is an iteration`, plan(2, async () => {
        const iter = uut.listen();
        uut.tick();
        // tslint:disable-next-line:no-unused-expression
        expect(await iter.next()).to.exist;
        await expectUnresolvedIteration(uut.listen());
    }));

    const several = 1e3;
    const many = 1e6;
    it(`several(${several}) ticks produce a single iteration if not read`, plan(2, async () => {
        const iter = uut.listen();
        for (let i = 0; i < several; i++) {
            uut.tick();
        }
        // tslint:disable-next-line:no-unused-expression
        expect(await iter.next()).to.exist;
        await expectUnresolvedIteration(uut.listen());
    }));

    it(`several(${several}) iterations test`, plan(several, async () => {
        const iter = uut.listen();
        uut.tick();
        let count = 1;
        for await (const item of iter) {
            // tslint:disable-next-line:no-unused-expression
            expect(item).to.eql(null);
            if (count < several) {
                uut.tick();
            } else {
                uut.end();
            }
            count++;
        }
    }));
    it(`many(${many}) iterations test`, plan(0, async () => {
        const iter = uut.listen();
        uut.tick();
        let count = 1;
        for await (const _ of iter) {
            if (count < many) {
                uut.tick();
            } else {
                uut.end();
            }
            count++;
        }
    }));

    it(`end stops iteration for new iterators`, plan(0, async () => {
        uut.end();
        for await (const _ of uut.listen()) {
            // tslint:disable-next-line:no-unused-expression
            expect.fail;
        }
    }));

    it(`end stops iteration for existing iterators`, plan(0, async () => {
        const iter = uut.listen();
        uut.tick();
        uut.tick();
        uut.end();
        for await (const _item of iter) {
            // tslint:disable-next-line:no-unused-expression
            expect.fail;
        }
    }));

  });
});
