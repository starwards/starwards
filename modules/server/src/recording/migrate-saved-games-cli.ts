/**
 * Converts text-format saved games (`.ssg`) to the binary format.
 *
 *   npm --prefix modules/server run migrate-saved-games -- <file|dir> [--out <dir>] [--dry-run]
 *
 * Recursive and idempotent: already-converted files are skipped. Each file is verified to hold the identical
 * snapshot before it replaces the original (or lands in `--out`, leaving the original).
 */
import { migrateSavedGames } from './migrate-saved-games';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const root = args.find((a, i) => !a.startsWith('--') && i !== outIndex + 1);
if (!root) {
    throw new Error('usage: migrate-saved-games <file|dir> [--out <dir>] [--dry-run]');
}

const dryRun = args.includes('--dry-run');
void migrateSavedGames(root, {
    dryRun,
    outDir: outIndex >= 0 ? args[outIndex + 1] : undefined,
    onFile: (file, outcome, detail) => process.stdout.write(`${outcome}\t${file}${detail ? `\t${detail}` : ''}\n`),
}).then((r) => {
    const saved = r.bytesBefore ? (1 - r.bytesAfter / r.bytesBefore) * 100 : 0;
    process.stdout.write(
        `${dryRun ? 'would convert' : 'converted'} ${r.converted}, skipped ${r.skipped}, failed ${r.failed}; ` +
            `${r.bytesBefore} -> ${r.bytesAfter} bytes (${saved.toFixed(1)}% saved)\n`,
    );
    process.exitCode = r.failed ? 1 : 0;
});
