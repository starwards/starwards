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

    // info, warn, and error are always visible regardless of DEBUG env var
    info.enabled = true;
    warn.enabled = true;
    error.enabled = true;

    return { debug, info, warn, error };
}
