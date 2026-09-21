import * as duckdb from 'duckdb';

import { decodeRecording, readRecordingHeader } from './decode';

interface Roles {
    readonly player?: string;
    readonly target?: string;
}

/** Thin promise wrapper over the DuckDB Node callback API used by this module. */
export class Store {
    private readonly db: duckdb.Database;
    private readonly con: duckdb.Connection;

    private constructor(dbPath: string) {
        this.db = new duckdb.Database(dbPath);
        this.con = this.db.connect();
    }

    static open(dbPath: string): Store {
        return new Store(dbPath);
    }

    run(sql: string, ...params: unknown[]): Promise<void> {
        return new Promise((resolve, reject) => {
            this.con.run(sql, ...params, (err: duckdb.DuckDbError | null) => (err ? reject(err) : resolve()));
        });
    }

    all<T = duckdb.RowData>(sql: string, ...params: unknown[]): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.con.all(sql, ...params, (err: duckdb.DuckDbError | null, rows: duckdb.TableData) =>
                err ? reject(err) : resolve(rows as unknown as T[]),
            );
        });
    }

    /**
     * Inserts many rows in one round trip via a multi-row `VALUES (...), (...), ...` statement,
     * chunked so the statement text stays bounded. A recording's `value`/`event` volume makes a
     * single awaited `run()` per row the dominant cost of ingest -- one DuckDB round trip per row
     * (a few ms each) adds up to tens of seconds over tens of thousands of rows.
     */
    async insertRows(table: string, columnCount: number, rows: readonly unknown[][], chunkSize = 500): Promise<void> {
        const placeholder = `(${Array(columnCount).fill('?').join(', ')})`;
        for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);
            const sql = `INSERT INTO ${table} VALUES ${chunk.map(() => placeholder).join(', ')}`;
            await this.run(sql, ...chunk.flat());
        }
    }

    /** Closes the connection and the underlying database file -- closing only the connection
     * leaves the native file handle open on Windows, so a caller that deletes the file right
     * after `close()` (as tests do) races an `EBUSY`. */
    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.con.close((err: duckdb.DuckDbError | null) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.db.close((closeErr: duckdb.DuckDbError | null) => (closeErr ? reject(closeErr) : resolve()));
            });
        });
    }

    async createSchema(): Promise<void> {
        await this.run(`CREATE TABLE IF NOT EXISTS run (
            run_id VARCHAR, map_name VARCHAR, started_at VARCHAR, interval_s DOUBLE, seed INTEGER,
            params_json VARCHAR, hz DOUBLE, format_version INTEGER, frame_count INTEGER, duration_s DOUBLE
        )`);
        await this.run(`CREATE TABLE IF NOT EXISTS frame (run_id VARCHAR, frame_no INTEGER, t DOUBLE)`);
        await this.run(`CREATE TABLE IF NOT EXISTS object (
            run_id VARCHAR, object_id VARCHAR, type VARCHAR, first_t DOUBLE, last_t DOUBLE, role VARCHAR
        )`);
        await this.run(`CREATE TABLE IF NOT EXISTS value (
            run_id VARCHAR, object_id VARCHAR, path VARCHAR, t DOUBLE, num DOUBLE, str VARCHAR, bool BOOLEAN
        )`);
        await this.run(`CREATE TABLE IF NOT EXISTS event (
            run_id VARCHAR, t DOUBLE, kind VARCHAR, object_id VARCHAR, source VARCHAR, detail_json VARCHAR
        )`);
        await this.run(`CREATE TABLE IF NOT EXISTS check_result (
            run_id VARCHAR, name VARCHAR, status VARCHAR, t DOUBLE, detail_json VARCHAR
        )`);
    }

    /** Delta-aware read: the last value with `t' <= t`. */
    async valueAt(
        runId: string,
        objectId: string,
        path: string,
        t: number,
    ): Promise<{ num: number | null; str: string | null; bool: boolean | null } | undefined> {
        const rows = await this.all(
            `SELECT num, str, bool FROM value WHERE run_id = ? AND object_id = ? AND path = ? AND t <= ?
             ORDER BY t DESC LIMIT 1`,
            runId,
            objectId,
            path,
            t,
        );
        return rows[0] as { num: number | null; str: string | null; bool: boolean | null } | undefined;
    }

    /** Delta-aware, undownsampled series between `t0` and `t1` -- the full resolution the store holds. */
    private async fullSeries(
        runId: string,
        objectId: string,
        path: string,
        t0: number,
        t1: number,
    ): Promise<Array<{ t: number; num: number | null; str: string | null; bool: boolean | null }>> {
        const rows = await this.all(
            `WITH ordered AS (
                SELECT t, num, str, bool,
                    lead(t) OVER (ORDER BY t) AS next_t
                FROM value WHERE run_id = ? AND object_id = ? AND path = ? AND t <= ?
                ORDER BY t
            )
            SELECT t, num, str, bool FROM ordered WHERE next_t IS NULL OR next_t > ?
            ORDER BY t`,
            runId,
            objectId,
            path,
            t1,
            t0,
        );
        return rows as Array<{ t: number; num: number | null; str: string | null; bool: boolean | null }>;
    }

    /** Delta-aware series between `t0` and `t1`, downsampled to at most `maxPoints` (last-value-wins per bucket). */
    async series(
        runId: string,
        objectId: string,
        path: string,
        t0: number,
        t1: number,
        maxPoints = 500,
    ): Promise<Array<{ t: number; num: number | null; str: string | null; bool: boolean | null }>> {
        const points = await this.fullSeries(runId, objectId, path, t0, t1);
        if (points.length <= maxPoints) {
            return points;
        }
        const step = Math.ceil(points.length / maxPoints);
        return points.filter((_, i) => i % step === 0);
    }

    /**
     * min/max/argmin/argmax over the full-resolution window (never downsampled) -- callers must
     * not derive these from `series()`'s downsampled points, which can drop the extreme values.
     */
    async seriesStats(
        runId: string,
        objectId: string,
        path: string,
        t0: number,
        t1: number,
    ): Promise<{ min: number | null; max: number | null; argmin: number | null; argmax: number | null }> {
        const points = await this.fullSeries(runId, objectId, path, t0, t1);
        let min: number | null = null;
        let max: number | null = null;
        let argmin: number | null = null;
        let argmax: number | null = null;
        for (const p of points) {
            if (p.num === null || p.num === undefined) {
                continue;
            }
            if (min === null || p.num < min) {
                min = p.num;
                argmin = p.t;
            }
            if (max === null || p.num > max) {
                max = p.num;
                argmax = p.t;
            }
        }
        return { min, max, argmin, argmax };
    }
}

/** `<name>.swr.duckdb` beside `<name>.swr.jsonl`, per the design spec's *Store* layout. */
export function storePathFor(recordingPath: string): string {
    return recordingPath.endsWith('.swr.jsonl')
        ? recordingPath.slice(0, -'.swr.jsonl'.length) + '.swr.duckdb'
        : `${recordingPath}.duckdb`;
}

/**
 * Decodes a recording and ingests it into a fresh DuckDB store, delta-encoding the `value` table
 * as it goes (a row only when the value differs from the previous frame for that object/path).
 */
export async function ingest(dbPath: string, recordingPath: string, roles: Roles = {}): Promise<Store> {
    const header = await readRecordingHeader(recordingPath);
    const store = Store.open(dbPath);
    await store.createSchema();
    const runId = recordingPath;
    await store.run('DELETE FROM run WHERE run_id = ?', runId);
    await store.run('DELETE FROM frame WHERE run_id = ?', runId);
    await store.run('DELETE FROM object WHERE run_id = ?', runId);
    await store.run('DELETE FROM value WHERE run_id = ?', runId);
    await store.run('DELETE FROM event WHERE run_id = ?', runId);
    await store.run('DELETE FROM check_result WHERE run_id = ?', runId);

    const lastValue = new Map<string, string | number | boolean>();
    const objectSeen = new Map<string, { type: string; firstT: number; lastT: number }>();
    let frameCount = 0;
    let lastT = 0;

    // Frame/value rows are collected in memory and flushed with `insertRows` rather than awaited
    // one at a time -- a recording's row count (tens of thousands for a tick-exact capture) makes
    // one DuckDB round trip per row the dominant cost of ingest.
    const frameRows: unknown[][] = [];
    const valueRows: unknown[][] = [];

    await store.run('BEGIN TRANSACTION');
    try {
        for await (const frame of decodeRecording(recordingPath)) {
            frameCount++;
            lastT = frame.t;
            frameRows.push([runId, frame.frameNo, frame.t]);
            for (const obj of frame.objects) {
                const seen = objectSeen.get(obj.objectId);
                if (seen) {
                    seen.lastT = frame.t;
                } else {
                    objectSeen.set(obj.objectId, { type: obj.type, firstT: frame.t, lastT: frame.t });
                }
            }
            for (const v of frame.values) {
                const key = `${v.objectId} ${v.path}`;
                const current = v.num ?? v.str ?? v.bool;
                if (current === undefined) {
                    continue;
                }
                if (lastValue.get(key) === current) {
                    continue;
                }
                lastValue.set(key, current);
                valueRows.push([runId, v.objectId, v.path, frame.t, v.num ?? null, v.str ?? null, v.bool ?? null]);
            }
        }
        await store.insertRows('frame', 3, frameRows);
        await store.insertRows('value', 7, valueRows);
        const objectRows = [...objectSeen].map(([objectId, seen]) => [
            runId,
            objectId,
            seen.type,
            seen.firstT,
            seen.lastT,
            roles.player === objectId ? 'player' : roles.target === objectId ? 'target' : null,
        ]);
        await store.insertRows('object', 6, objectRows);
        await store.run(
            'INSERT INTO run VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            runId,
            header.mapName,
            header.startedAt,
            header.intervalMs / 1000,
            header.seed ?? null,
            header.params !== undefined ? JSON.stringify(header.params) : null,
            null, // hz -- not yet in RecordingHeader; see Forward compatibility
            1,
            frameCount,
            lastT,
        );
        await store.run('COMMIT');
    } catch (err) {
        await store.run('ROLLBACK');
        throw err;
    }
    return store;
}
