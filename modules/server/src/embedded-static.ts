import * as path from 'node:path';
import * as sea from 'node:sea';

import { RequestHandler } from 'express';

/**
 * Serves files embedded in a single-executable build, keyed `<prefix><request path>`.
 * The `express.static` equivalent for assets that live in the exe instead of on disk.
 * A directory request (trailing `/`) serves its `index.html`; a missing key falls through to `next()`.
 */
export function embeddedStatic(prefix: string, getAsset: (key: string) => ArrayBuffer = sea.getAsset): RequestHandler {
    return (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return next();
        }
        const relative = req.path.endsWith('/') ? req.path + 'index.html' : req.path;
        const key = prefix + decodeURIComponent(relative).slice(1);
        let asset: ArrayBuffer;
        try {
            asset = getAsset(key);
        } catch {
            return next();
        }
        res.type(path.extname(key)).send(Buffer.from(asset));
    };
}
