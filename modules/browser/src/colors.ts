import { Color, ColorSource } from 'pixi.js';

// ============================================================================
// Core Colors (PixiJS hex format)
// ============================================================================
export const white = 0xffffff;
export const red = 0xd53434;
export const blue = 0x404fc9;
export const yellow = 0xe2b640;
export const green = 0x34d534;
export const selectionColor = 0x26dafd;

export const radarVisibleBg = 0x0f0f0f;
export const radarFogOfWar = 0x303030;
export const gridColors = [0xcccccc, 0xcccccc, 0x6666ff, 0xf4fa77, 0x55ff55, 0xff3333];

// ============================================================================
// Radar-Specific Colors
// ============================================================================
export const radar = {
    speedLine: 0x26fd9a,
    targetSpeedLine: 0x26cbcb,
    collisionOutline: 0x4ce73c,
    azimuthTint: 0xaaffaa,
    shellTint: 0xffaaaa,
    deflectionTint: 0xaaaaff,
};

// ============================================================================
// Status Colors (matches tweakpane.css [data-status] values)
// ============================================================================
export const status = {
    ok: 0x1a4d1a, // hsl(123, 61%, 18%)
    warn: 0x4d4a1a, // hsl(52, 61%, 18%)
    error: 0x4d1a1a, // hsl(0, 69%, 17%)
};

// ============================================================================
// HSL Palette (Primary Cyan Theme - Arwes Compatible)
// ============================================================================
// Lightness scale: index 0 = lightest (97%), index 12 = darkest (4%)
const lightnessScale = [97, 90, 74, 53, 44, 37, 30, 26, 21, 15, 10, 7, 4];

export const hsl = {
    primary: {
        /** Main saturation (~69%) */
        main: (index: number): string => `hsl(180, 69%, ${lightnessScale[index] ?? 26}%)`,
        /** High saturation (~90%) for hover/active states */
        high: (index: number): string => `hsl(180, 90%, ${lightnessScale[index] ?? 26}%)`,
    },
    secondary: 'hsl(60, 70%, 48%)', // Yellow/gold
    success: 'hsl(120, 50%, 40%)',
    error: 'hsl(10, 50%, 48%)',
    background: 'hsl(180, 20%, 4%)',
};

// Legacy palette mapping for existing code compatibility
export const paletteColors = {
    primary: hsl.primary.main(3),
    secondary: hsl.secondary,
    success: hsl.success,
    error: hsl.error,
    control: hsl.primary.main(3),
};

export type PaletteType = keyof typeof paletteColors;

// ============================================================================
// Conversion Utilities
// ============================================================================
export function toCss(color: ColorSource): string {
    if (typeof color === 'string') {
        return color;
    }
    if (typeof color === 'number') {
        return '#' + color.toString(16).padStart(6, '0');
    }
    return new Color(color).toHex();
}

/** Add alpha to an HSL color string */
export function withAlpha(hslColor: string, alpha: number): string {
    return hslColor.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
}
