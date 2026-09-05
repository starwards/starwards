import * as os from 'os';
import * as path from 'path';

import { GameManager } from './admin/game-manager';
import { VERSION } from '@starwards/core';
import { createLogger } from '@starwards/core/internal';
import { server } from './server';

/** Set by the pkg/@yao-pkg packager when running inside a packaged executable. */
interface PackagedProcess {
    pkg?: unknown;
}

const { info: logInfo, error: logError } = createLogger('server:prod');

export function resolvePort(env: Record<string, string | undefined>, isPackaged: boolean): number {
    return Number(env.PORT || (isPackaged ? 8080 : 80));
}

export function formatBanner(
    port: number,
    isPackaged: boolean,
    interfaces: ReturnType<typeof os.networkInterfaces> = os.networkInterfaces(),
): string[] {
    const lines = [`Starwards ${VERSION} on node ${process.version}, listening on http://localhost:${port}`];
    if (isPackaged) {
        for (const infos of Object.values(interfaces)) {
            for (const info of infos ?? []) {
                if (info.family === 'IPv4' && !info.internal) {
                    lines.push(`  http://${info.address}:${port}`);
                }
            }
        }
    }
    return lines;
}

function main() {
    const isPackaged = !!(process as typeof process & PackagedProcess).pkg;
    const port = resolvePort(process.env, isPackaged);

    process.on('uncaughtException', function (err) {
        logError(new Date().toUTCString() + ' uncaughtException:', err.message);
        logError(err.stack);
        // process.exit(1);
    });
    const gameManager = new GameManager();
    // this path has to match the setup in scripts/post-build.js and scripts/pkg.js
    void server(port, path.join(__dirname, '..', '..', '..', '..', 'static'), gameManager).then(({ addressInfo }) => {
        for (const line of formatBanner(addressInfo.port, isPackaged)) {
            logInfo(line);
        }
    });
}

if (require.main === module) {
    main();
}
