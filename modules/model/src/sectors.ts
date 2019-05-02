
export const sectorSize = 20000;
export function getSectorName(x: number, y: number) {
    return `${(Math.abs(x) / sectorSize).toFixed()}-${(Math.abs(y) / sectorSize).toFixed()}`;
}
