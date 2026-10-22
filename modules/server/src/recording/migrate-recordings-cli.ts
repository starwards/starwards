/**
 * Converts text-format `.sgr` recordings to the binary format.
 *
 *   npm --prefix modules/server run migrate-recordings -- <file|dir> [--out <dir>] [--dry-run]
 *
 * Recursive and idempotent: already-converted files are skipped. Each file is verified to read back as
 * identical records before it replaces the original (or lands in `--out`, leaving the original).
 */
import { migrateRecordings } from './migrate-recordings';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => args[args.indexOf(name) + 1];
const outIndex = args.indexOf('--out');
const root = args.find((a, i) => !a.startsWith('--') && i !== outIndex + 1);
if (!root) {
    throw new Error('usage: migrate-recordings <file|dir> [--out <dir>] [--dry-run]');
}

const dryRun = flag('--dry-run');
void migrateRecordings(root, {
    dryRun,
    outDir: outIndex >= 0 ? option('--out') : undefined,
    onFile: (file, outcome, detail) => process.stdout.write(`${outcome}\t${file}${detail ? `\t${detail}` : ''}\n`),
}).then((r) => {
    const saved = r.bytesBefore ? (1 - r.bytesAfter / r.bytesBefore) * 100 : 0;
    process.stdout.write(
        `${dryRun ? 'would convert' : 'converted'} ${r.converted}, skipped ${r.skipped}, failed ${r.failed}; ` +
            `${r.bytesBefore} -> ${r.bytesAfter} bytes (${saved.toFixed(1)}% saved)\n`,
    );
    process.exitCode = r.failed ? 1 : 0;
});
