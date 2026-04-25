import createDebug from 'debug';

const APP_PREFIX = 'starwards';

export function createLogger(namespace: string) {
    const debug = createDebug(`${APP_PREFIX}:${namespace}`);
    const warn = createDebug(`${APP_PREFIX}:${namespace}:warn`);
    const error = createDebug(`${APP_PREFIX}:${namespace}:error`);

    // eslint-disable-next-line no-console
    warn.log = console.warn.bind(console);
    // eslint-disable-next-line no-console
    error.log = console.error.bind(console);

    warn.enabled = true;
    error.enabled = true;

    return { debug, warn, error };
}
