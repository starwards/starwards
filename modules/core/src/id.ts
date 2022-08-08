import { customAlphabet } from 'nanoid';

const letters = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 1);
const alphanumeric = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 5);
export function makeId() {
    return letters() + alphanumeric();
}
const maxId = Number.MAX_SAFE_INTEGER / 2;
const uniqueIds: { [prefix: string]: number | undefined } = {};
export function uniqueId(prefix: string) {
    const num = uniqueIds[prefix] || 0;
    uniqueIds[prefix] = (num + 1) % maxId;
    return prefix + num.toString();
}
