import { customAlphabet } from 'nanoid';

const letters = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 1);
const alphanumeric = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 5);
export function makeId() {
    return letters() + alphanumeric();
}
