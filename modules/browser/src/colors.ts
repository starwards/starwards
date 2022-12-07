export const white = 0xffffff;
export const red = 0xd53434;
export const blue = 0x404fc9;
export const yellow = 0xe2b640;
export const green = 0x34d534;
export const selectionColor = 0x26dafd;

export const radarVisibleBg = 0x0f0f0f;
export const radarFogOfWar = 0x303030;
export const gridColors = [0xcccccc, 0xcccccc, 0x6666ff, 0xf4fa77, 0x55ff55, 0xff3333];

export function toCss(color: number | string) {
    if (typeof color === 'string') {
        return color;
    }
    return '#' + color.toString(16).padStart(6, '0');
}
