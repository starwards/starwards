import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const srcRoot = join(__dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name) ? [path] : [];
    });
}

/** Names of `widgets/<name>` modules imported by the given files. */
function importedWidgets(dir: string): Set<string> {
    const found = new Set<string>();
    for (const file of sourceFiles(dir)) {
        for (const match of readFileSync(file, 'utf8').matchAll(
            /from\s+'(?:\.{1,2}\/)+(?:src\/)?widgets\/([\w-]+)'/g,
        )) {
            found.add(match[1]);
        }
    }
    return found;
}

/**
 * Widgets a screen mounts that have no gallery scene, with the reason. A widget belongs here only
 * if it cannot be screenshotted as a station widget; everything else needs a scene in
 * `src/gallery/scenes/`, which brings a screenshot baseline from `gallery.spec.ts`.
 */
const exempt: Record<string, string> = {
    'design-state': 'GM golden-layout dashboard widget',
    monitor: 'GM golden-layout dashboard widget',
    radar: 'GM golden-layout dashboard widget; the radar scenes cover its renderer through the radar widgets',
    'target-radar': 'GM golden-layout dashboard widget',
    'game-controls': 'GM golden-layout dashboard widget',
    'game-setup': 'GM golden-layout dashboard widget',
    gm: 'GM golden-layout dashboard widget',
    dashboard: 'layout helper, not a widget',
    'radar-layers': 'radar helper, not a widget',
    'repair-queue-logic': 'logic module with unit tests, not a widget',
};

describe('gallery coverage', () => {
    const onScreens = importedWidgets(join(srcRoot, 'screens'));
    const inGallery = importedWidgets(join(srcRoot, 'gallery', 'scenes'));

    test('every widget a screen mounts has a gallery scene or a documented exemption', () => {
        const uncovered = [...onScreens].filter((name) => !inGallery.has(name) && !(name in exempt)).sort();
        expect(uncovered).toEqual([]);
    });

    test('exemptions name only widgets that a screen mounts and that lack a scene', () => {
        const stale = Object.keys(exempt).filter((name) => inGallery.has(name) || !onScreens.has(name));
        expect(stale).toEqual([]);
    });
});
