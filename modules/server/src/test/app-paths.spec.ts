import * as path from 'node:path';

import { writableDefault } from '../app-paths';

describe('writableDefault', () => {
    const source = path.resolve('some', 'module', '.recordings');

    it('keeps the source default outside a single executable', () => {
        expect(writableDefault(source, false, path.resolve('bin', 'starwards.exe'))).toBe(source);
    });

    it('moves next to the executable inside a single executable', () => {
        const exe = path.resolve('bin', 'starwards.exe');
        expect(writableDefault(source, true, exe)).toBe(path.resolve('bin', '.recordings'));
    });
});
