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
