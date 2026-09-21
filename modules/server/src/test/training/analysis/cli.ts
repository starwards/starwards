/**
 * `npm --prefix modules/server run analyze -- <command> [options]`. Every command's output is
 * JSON on stdout, bounded per the design spec; `--md` renders a markdown table.
 */
import * as fs from 'node:fs';

import { CHECK_CATALOGUE, computeChecks } from './checks';
import { DICTIONARY, dictionaryLookup } from './dictionary';
import { Store, ingest, storePathFor } from './store';

import { computeEvents } from './events';

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

async function resolveStore(): Promise<{ store: Store; runId: string }> {
    const storePath = arg('store');
    const recordingPath = arg('recording');
    if (storePath && !recordingPath) {
        if (!fs.existsSync(storePath)) {
            throw new Error(`store not found: ${storePath}`);
        }
        const store = Store.open(storePath);
        const rows = await store.all<{ run_id: string }>('SELECT run_id FROM run LIMIT 1');
        if (!rows[0]) {
            throw new Error(`store has no run row: ${storePath}`);
        }
        return { store, runId: rows[0].run_id };
    }
    if (!recordingPath) {
        throw new Error('--store or --recording is required');
    }
    const dbPath = storePath ?? storePathFor(recordingPath);
    const needsIngest = !fs.existsSync(dbPath) || fs.statSync(dbPath).mtimeMs < fs.statSync(recordingPath).mtimeMs;
    if (needsIngest) {
        const roles = parseRoles(arg('roles'));
        const store = await ingest(dbPath, recordingPath, roles);
        await computeEvents(store, recordingPath);
        await computeChecks(store, recordingPath);
        return { store, runId: recordingPath };
    }
    const store = Store.open(dbPath);
    return { store, runId: recordingPath };
}

function parseRoles(spec: string | undefined): { player?: string; target?: string } {
    if (!spec) {
        return {};
    }
    const roles: { player?: string; target?: string } = {};
    for (const part of spec.split(',')) {
        const [key, value] = part.split('=');
        if (key === 'p') {
            roles.player = value;
        } else if (key === 't') {
            roles.target = value;
        }
    }
    return roles;
}

function bigIntSafe(_key: string, value: unknown): unknown {
    return typeof value === 'bigint' ? Number(value) : value;
}

function output(data: unknown): void {
    if (hasFlag('md') && Array.isArray(data)) {
        process.stdout.write(toMarkdownTable(data as Array<Record<string, unknown>>));
    } else {
        process.stdout.write(JSON.stringify(data, bigIntSafe, 2) + '\n');
    }
}

function cellText(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }
    // symbol/function: rare in a SQL row, but stringify rather than crash.
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- both have well-defined toString()
    return String(value);
}

function toMarkdownTable(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) {
        return '(empty)\n';
    }
    const cols = Object.keys(rows[0]);
    const lines = [
        `| ${cols.join(' | ')} |`,
        `| ${cols.map(() => '---').join(' | ')} |`,
        ...rows.map((r) => `| ${cols.map((c) => cellText(r[c])).join(' | ')} |`),
    ];
    return lines.join('\n') + '\n';
}

async function main() {
    const command = process.argv[2];
    switch (command) {
        case 'ingest': {
            const { store } = await resolveStore();
            await store.close();
            output({ ok: true });
            break;
        }
        case 'summary': {
            const { store, runId } = await resolveStore();
            const run = (await store.all('SELECT * FROM run WHERE run_id = ?', runId))[0];
            const objects = await store.all('SELECT object_id, type, role FROM object WHERE run_id = ?', runId);
            const checks = await store.all(
                'SELECT name, status, t, detail_json FROM check_result WHERE run_id = ?',
                runId,
            );
            const eventCounts = await store.all(
                'SELECT kind, count(*) AS count FROM event WHERE run_id = ? GROUP BY kind ORDER BY kind',
                runId,
            );
            await store.close();
            output({ run, objects, checks, eventCounts });
            break;
        }
        case 'events': {
            const { store, runId } = await resolveStore();
            const kinds = arg('kind')?.split(',');
            const objectId = arg('object');
            const t0 = arg('t0');
            const t1 = arg('t1');
            let sql = 'SELECT t, kind, object_id, source, detail_json FROM event WHERE run_id = ?';
            const params: unknown[] = [runId];
            if (kinds) {
                sql += ` AND kind IN (${kinds.map(() => '?').join(',')})`;
                params.push(...kinds);
            }
            if (objectId) {
                sql += ' AND object_id = ?';
                params.push(objectId);
            }
            if (t0) {
                sql += ' AND t >= ?';
                params.push(Number(t0));
            }
            if (t1) {
                sql += ' AND t <= ?';
                params.push(Number(t1));
            }
            sql += ' ORDER BY t';
            const rows = await store.all(sql, ...params);
            await store.close();
            output(rows);
            break;
        }
        case 'checks': {
            if (hasFlag('list')) {
                output(CHECK_CATALOGUE);
                break;
            }
            const { store, runId } = await resolveStore();
            const only = arg('only');
            const rows = only
                ? await store.all(
                      'SELECT name, status, t, detail_json FROM check_result WHERE run_id = ? AND name = ?',
                      runId,
                      only,
                  )
                : await store.all('SELECT name, status, t, detail_json FROM check_result WHERE run_id = ?', runId);
            await store.close();
            output(rows);
            break;
        }
        case 'series': {
            const { store, runId } = await resolveStore();
            const objectId = arg('object');
            const path = arg('path');
            if (!objectId || !path) {
                throw new Error('--object and --path are required');
            }
            const t0 = Number(arg('t0') ?? '0');
            const t1Arg = arg('t1');
            const run = (
                await store.all<{ duration_s: number }>('SELECT duration_s FROM run WHERE run_id = ?', runId)
            )[0];
            const t1 = t1Arg ? Number(t1Arg) : (run?.duration_s ?? 0);
            const points = await store.series(runId, objectId, path, t0, t1, 500);
            const stats = await store.seriesStats(runId, objectId, path, t0, t1);
            await store.close();
            output({ points, ...stats, count: points.length });
            break;
        }
        case 'at': {
            const { store, runId } = await resolveStore();
            const t = Number(arg('t'));
            const objectId = arg('object');
            const pathPrefix = arg('path');
            const objects = objectId
                ? [objectId]
                : (await store.all<{ object_id: string }>('SELECT object_id FROM object WHERE run_id = ?', runId)).map(
                      (r) => r.object_id,
                  );
            const results: Array<{ objectId: string; path: string; value: unknown }> = [];
            for (const oid of objects) {
                let sql = 'SELECT DISTINCT path FROM value WHERE run_id = ? AND object_id = ?';
                const params: unknown[] = [runId, oid];
                if (pathPrefix) {
                    sql += ' AND path LIKE ?';
                    params.push(`${pathPrefix}%`);
                }
                const paths = await store.all<{ path: string }>(sql, ...params);
                for (const { path } of paths) {
                    const v = await store.valueAt(runId, oid, path, t);
                    results.push({ objectId: oid, path, value: v ? (v.num ?? v.str ?? v.bool ?? null) : null });
                }
            }
            await store.close();
            output(results);
            break;
        }
        case 'diff': {
            const { store, runId } = await resolveStore();
            const otherPath = arg('other');
            const objectId = arg('object');
            if (otherPath) {
                const from = Number(arg('from') ?? '0');
                const other = Store.open(otherPath);
                const otherRunId = (await other.all<{ run_id: string }>('SELECT run_id FROM run LIMIT 1'))[0]?.run_id;
                const paths = await store.all<{ path: string }>(
                    'SELECT DISTINCT path FROM value WHERE run_id = ? AND t >= ?',
                    runId,
                    from,
                );
                const divergences: Array<{ path: string; t: number; a: unknown; b: unknown }> = [];
                for (const { path } of paths) {
                    const aRows = await store.all<{
                        t: number;
                        num: number | null;
                        str: string | null;
                        bool: boolean | null;
                    }>(
                        'SELECT t, num, str, bool FROM value WHERE run_id = ? AND path = ? AND t >= ? ORDER BY t',
                        runId,
                        path,
                        from,
                    );
                    for (const row of aRows) {
                        const bVal = await other.valueAt(otherRunId ?? '', objectId ?? '', path, row.t);
                        const aVal = row.num ?? row.str ?? row.bool;
                        const bValResolved = bVal ? (bVal.num ?? bVal.str ?? bVal.bool) : undefined;
                        if (aVal !== bValResolved) {
                            divergences.push({ path, t: row.t, a: aVal, b: bValResolved ?? null });
                            break;
                        }
                    }
                }
                await other.close();
                await store.close();
                output(divergences);
                break;
            }
            const t0 = Number(arg('t0'));
            const t1 = Number(arg('t1'));
            let sql = 'SELECT DISTINCT path, object_id FROM value WHERE run_id = ? AND t BETWEEN ? AND ?';
            const params: unknown[] = [runId, t0, t1];
            if (objectId) {
                sql += ' AND object_id = ?';
                params.push(objectId);
            }
            const rows = await store.all<{ path: string; object_id: string }>(sql, ...params);
            const results = [];
            for (const row of rows) {
                const a = await store.valueAt(runId, row.object_id, row.path, t0);
                const b = await store.valueAt(runId, row.object_id, row.path, t1);
                results.push({
                    objectId: row.object_id,
                    path: row.path,
                    before: a ? (a.num ?? a.str ?? a.bool) : null,
                    after: b ? (b.num ?? b.str ?? b.bool) : null,
                });
            }
            await store.close();
            output(results);
            break;
        }
        case 'dictionary': {
            const pathPrefix = arg('path');
            output(dictionaryLookup(pathPrefix) ?? DICTIONARY);
            break;
        }
        case 'sql': {
            const { store } = await resolveStore();
            const query = process.argv[3];
            if (!query || !/^\s*select/i.test(query)) {
                throw new Error('sql command is read-only; query must start with SELECT');
            }
            const rows = await store.all(query);
            await store.close();
            output(rows);
            break;
        }
        default:
            throw new Error(`unknown command: ${command ?? '(none)'}`);
    }
}

void main().catch((err) => {
    process.stderr.write(`${(err as Error).stack ?? err}\n`);
    process.exit(1);
});
