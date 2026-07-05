import createDebug from 'debug';

const APP_PREFIX = 'starwards';

export function createLogger(namespace: string) {
    const debug = createDebug(`${APP_PREFIX}:${namespace}`);
    const info = createDebug(`${APP_PREFIX}:${namespace}:info`);
    const warn = createDebug(`${APP_PREFIX}:${namespace}:warn`);
    const error = createDebug(`${APP_PREFIX}:${namespace}:error`);

    // eslint-disable-next-line no-console
    info.log = console.log.bind(console);
    // eslint-disable-next-line no-console
    warn.log = console.warn.bind(console);
    // eslint-disable-next-line no-console
    error.log = console.error.bind(console);

    // Force info/warn/error visible in normal runs; under Jest fall back to the
    // debug package's DEBUG-driven enablement so tests are quiet by default.
    // Re-enable in a specific test run with DEBUG=starwards:* (or a narrower namespace).
    if (!process.env.JEST_WORKER_ID) {
        info.enabled = true;
        warn.enabled = true;
        error.enabled = true;
    }

    return { debug, info, warn, error };
}
