import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { bytesToSavedGame, savedGameToBytes } from '../serialization/game-state-serialization';
import { isBinarySavedGame } from '@starwards/core/internal';

/** File extension of a saved game. */
const SAVED_GAME_EXT = '.ssg';

interface MigrateOptions {
    /** Write the converted files here, mirroring the tree under the source, instead of replacing in place. */
    outDir?: string;
    /** Report what would be converted and the size saved, writing nothing. */
    dryRun?: boolean;
    /** Called once per file with what happened to it. */
    onFile?: (file: string, outcome: 'converted' | 'skipped' | 'failed', detail?: string) => void;
}

interface MigrateReport {
    converted: number;
    skipped: number;
    failed: number;
    bytesBefore: number;
    bytesAfter: number;
}

async function* savedGameFiles(root: string): AsyncGenerator<string> {
    if (!(await fs.stat(root)).isDirectory()) {
        yield root;
        return;
    }
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) yield* savedGameFiles(full);
        else if (entry.isFile() && entry.name.endsWith(SAVED_GAME_EXT)) yield full;
    }
}

/** Throws unless `converted` holds exactly the snapshot `original` does. */
async function verifyRoundTrip(original: Buffer, converted: Buffer) {
    const [a, b] = await Promise.all([savedGameToBytes(original), savedGameToBytes(converted)]);
    if (Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0)
        throw new Error('converted file differs from the original');
}

/**
 * Converts the text-format (gzip+base64) saved games (`.ssg`) under `root` (a file or a directory, recursively)
 * to the binary format. Binary files are skipped, so a run can be repeated or resumed. Each conversion is
 * written beside its target, verified to hold the identical snapshot, and only then moved into place.
 */
export async function migrateSavedGames(root: string, options: MigrateOptions): Promise<MigrateReport> {
    const report: MigrateReport = { converted: 0, skipped: 0, failed: 0, bytesBefore: 0, bytesAfter: 0 };
    const rootIsDir = (await fs.stat(root)).isDirectory();
    for await (const src of savedGameFiles(root)) {
        const dest = options.outDir
            ? path.join(options.outDir, rootIsDir ? path.relative(root, src) : path.basename(src))
            : src;
        try {
            const original = await fs.readFile(src);
            if (isBinarySavedGame(original)) {
                report.skipped++;
                options.onFile?.(src, 'skipped');
                continue;
            }
            const converted = await bytesToSavedGame(await savedGameToBytes(original));
            await verifyRoundTrip(original, converted);
            if (!options.dryRun) {
                await fs.mkdir(path.dirname(dest), { recursive: true });
                const tmp = `${dest}.migrating`;
                try {
                    await fs.writeFile(tmp, converted);
                    await fs.rename(tmp, dest);
                } catch (e) {
                    await fs.rm(tmp, { force: true });
                    throw e;
                }
            }
            report.converted++;
            report.bytesBefore += original.length;
            report.bytesAfter += converted.length;
            options.onFile?.(src, 'converted', `${original.length} -> ${converted.length} bytes`);
        } catch (e) {
            report.failed++;
            options.onFile?.(src, 'failed', String(e));
        }
    }
    return report;
}
