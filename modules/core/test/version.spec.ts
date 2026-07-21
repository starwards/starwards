import { VERSION } from '../src/version';

import corePackageJson from '../package.json';

describe('VERSION', () => {
    test('matches the version in package.json', () => {
        expect(VERSION).toEqual(corePackageJson.version);
    });
});
