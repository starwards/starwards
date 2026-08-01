#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sensitivity check for the gallery visual tests.
 *
 * A `toHaveScreenshot` assertion that cannot fail is not testing anything. This script proves each
 * gallery scene *can* fail: it re-runs `gallery.spec.ts` with `GALLERY_PERTURB` set, which makes the
 * gallery page displace every scene's rendered output by that many pixels. Every scene assertion is
 * then expected to FAIL. A scene that still passes is insensitive — its screenshot assertion would
 * not catch a real regression in the widget it covers, and this script exits non-zero naming it.
 *
 * Usage: node scripts/check-gallery-sensitivity.mjs [--perturb=1] [--project=chromium]
 */
import { mkdtempSync, readFileSync, rmSync } from 'fs';

import { join } from 'path';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';

const args = process.argv.slice(2);
const optionOf = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;

const perturb = optionOf('perturb', '1');
const project = optionOf('project', 'chromium');
const sceneTestSuffix = ' renders correctly';

const outputDir = mkdtempSync(join(tmpdir(), 'gallery-sensitivity-'));
const reportFile = join(outputDir, 'report.json');

const run = spawnSync(
    'npx',
    [
        'playwright',
        'test',
        'modules/e2e/test/visual/gallery.spec.ts',
        `--project=${project}`,
        `--grep=${sceneTestSuffix}`,
        '--retries=0',
        '--reporter=json',
    ],
    {
        env: {
            ...process.env,
            GALLERY_PERTURB: perturb,
            PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
            PLAYWRIGHT_HTML_OPEN: 'never',
        },
        encoding: 'utf8',
        stdio: ['inherit', 'pipe', 'inherit'],
        shell: process.platform === 'win32',
    },
);

let report;
try {
    report = JSON.parse(readFileSync(reportFile, 'utf8'));
} catch {
    process.stdout.write(run.stdout ?? '');
    console.error(`\nCould not read a Playwright JSON report from ${reportFile}. The perturbed run did not complete.`);
    rmSync(outputDir, { recursive: true, force: true });
    process.exit(1);
}
rmSync(outputDir, { recursive: true, force: true });

/** @returns {{title: string, status: string}[]} */
function collectTests(suite) {
    const tests = (suite.specs ?? []).map((spec) => ({
        title: spec.title,
        status: spec.tests?.every((t) => t.status === 'expected') ? 'passed' : 'failed',
    }));
    for (const child of suite.suites ?? []) {
        tests.push(...collectTests(child));
    }
    return tests;
}

const scenes = report.suites
    .flatMap(collectTests)
    .filter((t) => t.title.endsWith(sceneTestSuffix))
    .map((t) => ({ scene: t.title.slice(0, -sceneTestSuffix.length), sensitive: t.status === 'failed' }))
    .sort((a, b) => a.scene.localeCompare(b.scene));

if (!scenes.length) {
    console.error('No gallery scene assertions ran — the sensitivity check measured nothing.');
    process.exit(1);
}

const insensitive = scenes.filter((s) => !s.sensitive);
console.log(`\nGallery snapshot sensitivity (${project}, ${perturb}px perturbation)\n`);
for (const { scene, sensitive } of scenes) {
    console.log(`  ${sensitive ? 'DETECTED  ' : 'MISSED    '}${scene}`);
}
console.log(`\n${scenes.length - insensitive.length}/${scenes.length} scenes detected the perturbation.`);

if (insensitive.length) {
    console.error(
        `\n${insensitive.length} scene(s) did not fail when their widget moved by ${perturb}px, so their ` +
            `snapshot assertion cannot catch a regression:\n` +
            insensitive.map((s) => `  - ${s.scene}`).join('\n'),
    );
    process.exit(1);
}
console.log('Every gallery scene detected the perturbation.');
