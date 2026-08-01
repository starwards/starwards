import { join, relative, sep } from 'path';
import { readFileSync, readdirSync } from 'fs';

const srcRoot = join(__dirname, '..', 'src');
const helperFile = join(srcRoot, 'panel', 'widget-pane.ts');

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
}

/**
 * `createWidgetPane` is the single place that wires a tweakpane pane to a widget container's
 * lifecycle. A widget that calls `createPane` with `container.getElement()` is hand-rolling that
 * wiring again — the boilerplate this helper exists to remove.
 */
const handWiredPane = /createPane\(\{[^}]*container\.getElement\(\)/;

describe('widget pane setup', () => {
    test('no source file wires a pane to a container by hand', () => {
        const offenders = sourceFiles(srcRoot)
            .filter((file) => file !== helperFile)
            .filter((file) => handWiredPane.test(readFileSync(file, 'utf8')))
            .map((file) => relative(srcRoot, file).split(sep).join('/'));
        expect(offenders).toEqual([]);
    });
});
