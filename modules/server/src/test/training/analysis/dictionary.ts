/** One `value`/`event` path this tool cares about: what it means, its unit, and when it appeared. */
interface DictionaryEntry {
    readonly path: string;
    readonly meaning: string;
    readonly unit: string;
    readonly since: number;
}

/**
 * `path` → meaning for the paths analysis actively derives events/checks from. Not every synced
 * field appears here -- `decode.ts` flattens whatever `SavedGame` contains and hardcodes no path
 * list (see spec *Forward compatibility*); this is the curated subset an investigator needs.
 */
export const DICTIONARY: readonly DictionaryEntry[] = [
    { path: '/destroyed', meaning: 'object destroyed', unit: 'boolean', since: 1 },
    { path: '/position/x', meaning: 'world position, x', unit: 'm', since: 1 },
    { path: '/position/y', meaning: 'world position, y', unit: 'm', since: 1 },
    { path: '/velocity/x', meaning: 'world velocity, x', unit: 'm/s', since: 1 },
    { path: '/velocity/y', meaning: 'world velocity, y', unit: 'm/s', since: 1 },
    {
        path: '/healthRatio',
        meaning:
            'ship health, 1 = intact, 0 = derelict threshold. A derived getter (ShipState.healthRatio), computed and injected by decode.ts since it is not itself a synced field',
        unit: 'ratio 0-1',
        since: 1,
    },
    { path: '/armor/armorPlates/N/layers/M/health', meaning: 'armor plate layer health', unit: 'hp', since: 1 },
    { path: '/chainGuns/N/isFiring', meaning: 'gun N firing', unit: 'boolean', since: 1 },
    { path: '/chainGuns/N/design/maxShellRange', meaning: 'gun N effective shell range', unit: 'm', since: 1 },
    { path: '/magazine/count_HiExpShell', meaning: 'HiExp shells remaining', unit: 'count', since: 1 },
    { path: '/magazine/count_ArmPenShell', meaning: 'ArmPen shells remaining', unit: 'count', since: 1 },
    { path: '/magazine/count_FragShell', meaning: 'Frag shells remaining', unit: 'count', since: 1 },
];

export function dictionaryLookup(pathPrefix?: string): readonly DictionaryEntry[] {
    if (!pathPrefix) {
        return DICTIONARY;
    }
    return DICTIONARY.filter((e) => e.path.startsWith(pathPrefix));
}
