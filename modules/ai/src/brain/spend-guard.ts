import { JEV_DOLLARS_PER_MILLION_TOKENS } from '../training/report';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A cumulative Jev spend ledger shared by every process and pod that writes the same file (the archive
 * volume): one JSON line per reservation and one per settlement. A job reserves a pessimistic estimate
 * before it asks Jev anything and settles it with what it actually paid; the total counts a settled
 * reservation at its actual cost and an open one at its estimate, so a crashed job keeps its
 * reservation. Reserving takes a directory lock (mkdir is atomic, on NFS too) so two jobs never both
 * pass the cap on the same remaining budget.
 */
type LedgerLine =
    | { type: 'reserve'; id: string; job: string; usd: number; at: string }
    | { type: 'settle'; id: string; job: string; usd: number; tokens: number; at: string };

type Reservation = { id: string; usd: number };

/** Dollars a request of `chars` characters costs at most: a token is at least two characters of JSON. */
export function pessimisticUsd(chars: number) {
    return ((chars / 2) * JEV_DOLLARS_PER_MILLION_TOKENS) / 1e6;
}

export function tokensUsd(tokens: number) {
    return (tokens * JEV_DOLLARS_PER_MILLION_TOKENS) / 1e6;
}

function readLines(ledger: string): LedgerLine[] {
    if (!fs.existsSync(ledger)) return [];
    return fs
        .readFileSync(ledger, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as LedgerLine);
}

/** Dollars spent or held so far: settled reservations at their actual cost, open ones at their estimate. */
export function ledgerTotal(ledger: string) {
    const byId = new Map<string, number>();
    for (const line of readLines(ledger)) {
        if (line.type === 'reserve' && !byId.has(line.id)) byId.set(line.id, line.usd);
        if (line.type === 'settle') byId.set(line.id, line.usd);
    }
    return [...byId.values()].reduce((a, b) => a + b, 0);
}

/** One whole line per write call: O_APPEND writes of a line land whole, never interleaved. */
function append(ledger: string, line: LedgerLine) {
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.appendFileSync(ledger, JSON.stringify(line) + '\n', { flag: 'a' });
}

function sleep(ms: number) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLock<T>(ledger: string, fn: () => T, staleMs = 60_000): T {
    const lock = `${ledger}.lock`;
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    for (;;) {
        try {
            fs.mkdirSync(lock);
            break;
        } catch {
            try {
                if (Date.now() - fs.statSync(lock).mtimeMs > staleMs) fs.rmdirSync(lock);
            } catch {
                // the holder released it meanwhile
            }
            sleep(100);
        }
    }
    try {
        return fn();
    } finally {
        fs.rmdirSync(lock);
    }
}

/**
 * Reserves `usd` for `job` if the ledger's total plus `usd` stays within `capUsd`; otherwise returns
 * the refusal and writes nothing.
 */
export function reserve(
    ledger: string,
    job: string,
    usd: number,
    capUsd: number,
): { ok: true; reservation: Reservation; total: number } | { ok: false; total: number; reason: string } {
    return withLock(ledger, () => {
        const total = ledgerTotal(ledger);
        if (total + usd > capUsd + 1e-12) {
            return {
                ok: false as const,
                total,
                reason: `jev spend guard: $${total.toFixed(4)} spent or held + $${usd.toFixed(4)} estimated exceeds the $${capUsd} cap`,
            };
        }
        const id = `${job}#${process.pid}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
        append(ledger, { type: 'reserve', id, job, usd, at: new Date().toISOString() });
        return { ok: true as const, reservation: { id, usd }, total: total + usd };
    });
}

/** Replaces a reservation's estimate with what the job actually paid. */
export function settle(ledger: string, job: string, reservation: Reservation, tokens: number) {
    withLock(ledger, () =>
        append(ledger, {
            type: 'settle',
            id: reservation.id,
            job,
            usd: tokensUsd(tokens),
            tokens,
            at: new Date().toISOString(),
        }),
    );
}
