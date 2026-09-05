import * as os from 'os';
import * as path from 'path';

import { GameManager } from './admin/game-manager';
import QRCode from 'qrcode';
import { VERSION } from '@starwards/core';
import { createLogger } from '@starwards/core/internal';
import { exec } from 'child_process';
import { getNetworkAddresses } from './network-info';
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
        for (const { url } of getNetworkAddresses(interfaces, port)) {
            lines.push(`  ${url}`);
        }
    }
    return lines;
}

/** The command each platform uses to open a URL in the default browser. `null` when none is known. */
export function openCommand(platform: typeof process.platform, url: string): string | null {
    switch (platform) {
        case 'win32':
            return `start "" "${url}"`;
        case 'linux':
            return `xdg-open "${url}"`;
        case 'darwin':
            return `open "${url}"`;
        default:
            return null;
    }
}

function openBrowser(url: string): void {
    const command = openCommand(process.platform, url);
    if (!command) {
        return;
    }
    // headless/CI hosts have no browser and no display — exec fails there, which is fine to ignore
    exec(command, (err) => {
        if (err) {
            logError(`could not auto-open browser: ${err.message}`);
        }
    });
}

/**
 * A double-clicked exe that crashes on startup closes its console window with the error unread.
 * Blocking on a keypress on fatal error keeps that window open long enough to read it.
 */
export function waitForKeypress(): Promise<void> {
    return new Promise((resolve) => {
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.once('data', () => resolve());
    });
}

async function fatalExit(err: unknown, isPackaged: boolean): Promise<never> {
    logError('Starwards failed to start:', err instanceof Error ? (err.stack ?? err.message) : String(err));
    if (isPackaged) {
        // eslint-disable-next-line no-console
        console.log('Press any key to exit...');
        await waitForKeypress();
    }
    return process.exit(1);
}

async function printLanQrCode(url: string): Promise<void> {
    try {
        logInfo(await QRCode.toString(url, { type: 'terminal', small: true }));
    } catch (e) {
        logError('could not render QR code for', url, e);
    }
}

async function main() {
    const isPackaged = !!(process as typeof process & PackagedProcess).pkg;
    const port = resolvePort(process.env, isPackaged);

    process.on('uncaughtException', function (err) {
        logError(new Date().toUTCString() + ' uncaughtException:', err.message);
        logError(err.stack);
        // process.exit(1);
    });
    const gameManager = new GameManager();
    try {
        // this path has to match the setup in scripts/post-build.js and scripts/pkg.js
        const { addressInfo } = await server(port, path.join(__dirname, '..', '..', '..', '..', 'static'), gameManager);
        for (const line of formatBanner(addressInfo.port, isPackaged)) {
            logInfo(line);
        }
        if (isPackaged) {
            logInfo("If Windows asks about network access, click Allow — other devices can't connect otherwise.");
            const [lanAddress] = getNetworkAddresses(os.networkInterfaces(), addressInfo.port);
            if (lanAddress) {
                await printLanQrCode(lanAddress.url);
            }
            if (!process.env.STARWARDS_NO_OPEN) {
                openBrowser(`http://localhost:${addressInfo.port}/`);
            }
        }
    } catch (err) {
        await fatalExit(err, isPackaged);
    }
}

if (require.main === module) {
    void main();
}
