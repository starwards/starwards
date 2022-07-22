import { gzip, unzip } from 'node:zlib';

import { GameStateFragment } from './game-state-fragment';
import { promisify } from 'node:util';

const do_gzip = promisify(gzip);
const do_unzip = promisify(unzip);

export async function fragmentToString(fragment: GameStateFragment) {
    const zipped = await do_gzip(Buffer.from(fragment.encodeAll()));
    return zipped.toString('base64');
}

export async function stringToFragment(serialized: string) {
    const unzipped = await do_unzip(Buffer.from(serialized, 'base64'));
    const result = new GameStateFragment();
    result.decode([...unzipped]);
    return result;
}
export async function getUnzipped(zipped: string) {
    const unzipped = await do_unzip(Buffer.from(zipped, 'base64'));
    return unzipped.toString('base64');
}
