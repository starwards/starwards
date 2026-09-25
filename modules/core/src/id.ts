export function makeId() {
    return uniqueId('');
}
const maxId = Number.MAX_SAFE_INTEGER / 2;
const uniqueIds: { [prefix: string]: number | undefined } = {};
export function uniqueId(prefix: string) {
    const num = uniqueIds[prefix] || 0;
    uniqueIds[prefix] = (num + 1) % maxId;
    return prefix + num.toString();
}

/**
 * Restarts every id sequence. Headless runs only: ids key die rolls, so a seeded run replays the
 * same game only from the same id state. Never call it while objects from an earlier run live on.
 */
export function resetIds() {
    for (const prefix of Object.keys(uniqueIds)) {
        delete uniqueIds[prefix];
    }
}

/**
 * Moves each id sequence past the ids in `ids` (an id is its prefix followed by its number), so
 * sequences restarted or never started in this process don't hand out an id an object already has.
 */
export function reserveIds(ids: Iterable<string>) {
    for (const id of ids) {
        const match = /^(.*?)(\d+)$/.exec(id);
        if (match) {
            const [, prefix, num] = match;
            uniqueIds[prefix] = Math.max(uniqueIds[prefix] || 0, (Number(num) + 1) % maxId);
        }
    }
}
