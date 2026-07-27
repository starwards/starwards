import { Color, ColorSource } from 'pixi.js';

// ============================================================================
// Core Colors (PixiJS hex format)
// Matches Industrial Sci-Fi design system (docs/reference/color-design-system.html)
// ============================================================================
export const white = 0xffffff;
export const red = 0xd53434;
export const blue = 0x404fc9;
export const yellow = 0xe2b640;
export const green = 0x34d534;
export const selectionColor = 0x00ffff; // Pure cyan

export const radarVisibleBg = 0x0a0a0a; // --bg-primary
export const radarFogOfWar = 0x1a1a1a; // --bg-tertiary
export const gridColors = [0x00ffff, 0x00cccc, 0x009999, 0x006666, 0x003333, 0xff6600]; // Cyan scale + orange

// ============================================================================
// Radar-Specific Colors
// ============================================================================
export const radar = {
    speedLine: 0x00ffff, // Pure cyan
    targetSpeedLine: 0x00cccc, // Dimmer cyan
    collisionOutline: 0x4ce73c, // Green (danger indicator)
    azimuthTint: 0x00ffff, // Pure cyan
    shellTint: 0xff6600, // Orange (secondary)
    deflectionTint: 0x00aaff, // Cyan-blue
    unknownTint: 0x666666, // Dim gray for UFO/unscanned objects
};

// ============================================================================
// HSL Palette (Industrial Sci-Fi Theme - Pure Cyan/Orange)
// Matches docs/reference/color-design-system.html
// ============================================================================
// Lightness scale: index 0 = lightest (97%), index 12 = darkest (4%)
const lightnessScale = [97, 90, 74, 53, 44, 37, 30, 26, 21, 15, 10, 7, 4];

export const hsl = {
    primary: {
        /** Pure cyan at full saturation (#00ffff at 50% lightness) */
        main: (index: number): string => `hsl(180, 100%, ${lightnessScale[index] ?? 26}%)`,
        /** Slightly brighter for hover/active states */
        high: (index: number): string => `hsl(180, 100%, ${Math.min((lightnessScale[index] ?? 26) + 10, 97)}%)`,
    },
    secondary: 'hsl(24, 100%, 50%)', // Orange #ff6600
    success: 'hsl(120, 50%, 40%)',
    error: 'hsl(10, 50%, 48%)',
    background: 'hsl(0, 0%, 4%)', // Grayscale #0a0a0a
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
