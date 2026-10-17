import { embeddedStatic } from '../embedded-static';
import express from 'express';
import request from 'supertest';

const assets: Record<string, string> = {
    'static/index.html': '<html>lobby</html>',
    'static/ship.js': 'console.log(1)',
    'static/sub dir/a.png': 'png',
    'monitor/bundle.js': 'monitor',
};

function getAsset(key: string): ArrayBuffer {
    const text = assets[key];
    if (text === undefined) {
        throw new Error(`no asset ${key}`);
    }
    return new TextEncoder().encode(text).buffer;
}

function appWith(prefix: string) {
    const app = express();
    app.use('/', embeddedStatic(prefix, getAsset));
    app.use((_req, res) => res.status(404).send('fallthrough'));
    return app;
}

describe('embeddedStatic', () => {
    it('serves an asset with the content type of its extension', async () => {
        const res = await request(appWith('static/')).get('/ship.js');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/javascript/);
        expect(res.text).toBe('console.log(1)');
    });

    it('serves index.html for a directory request', async () => {
        const res = await request(appWith('static/')).get('/');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
        expect(res.text).toBe('<html>lobby</html>');
    });

    it('decodes percent-encoded paths', async () => {
        const res = await request(appWith('static/')).get('/sub%20dir/a.png');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/png');
    });

    it('falls through when the asset is missing', async () => {
        const res = await request(appWith('static/')).get('/missing.js');
        expect(res.status).toBe(404);
        expect(res.text).toBe('fallthrough');
    });

    it('only looks under its own prefix', async () => {
        const res = await request(appWith('monitor/')).get('/ship.js');
        expect(res.text).toBe('fallthrough');
        expect((await request(appWith('monitor/')).get('/bundle.js')).text).toBe('monitor');
    });

    it('ignores methods other than GET and HEAD', async () => {
        const res = await request(appWith('static/')).post('/ship.js');
        expect(res.text).toBe('fallthrough');
    });
});
