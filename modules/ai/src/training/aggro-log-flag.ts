import { AGGRO_LOG_ENV } from '@starwards/server/src/test/headless-recorder';

/**
 * `--aggro-log[=period_s]` (period default 1 sim-s) turns the recorder's `aggro` sidecar log on by
 * setting {@link AGGRO_LOG_ENV} in `env`, so forked workers inherit it. Without the flag `env` is unchanged.
 */
export function applyAggroLogFlag(argv: readonly string[], env: Record<string, string | undefined> = process.env) {
    const flag = argv.find((a) => a === '--aggro-log' || a.startsWith('--aggro-log='));
    if (flag) env[AGGRO_LOG_ENV] = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : '1';
    return env;
}
