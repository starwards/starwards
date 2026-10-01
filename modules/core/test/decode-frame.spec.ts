import { SavedGame, Spaceship, decodeFrame } from '../src';
import { Encoder } from '@colyseus/schema';
import { gzipSync } from 'node:zlib';

function encodeLikeServer(game: SavedGame) {
    return gzipSync(Buffer.from(new Encoder(game).encodeAll())).toString('base64');
}

describe('decodeFrame', () => {
    it('decodes a server-encoded frame', async () => {
        const game = new SavedGame();
        game.mapName = 'test-map';
        const ship = new Spaceship();
        ship.id = 'ship-1';
        ship.position.x = 123;
        ship.position.y = -45;
        game.fragment.space.set(ship);

        const decoded = await decodeFrame(SavedGame, encodeLikeServer(game));

        expect(decoded.mapName).toBe('test-map');
        expect(decoded.fragment.space.getShip('ship-1')?.position.x).toBe(123);
        expect(decoded.fragment.space.getShip('ship-1')?.position.y).toBe(-45);
    });
});
