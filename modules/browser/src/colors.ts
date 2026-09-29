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
/** Station readout status colours; keep in sync with `--sw-*` in static/styles/tweakpane.css. */
export const status = {
    ok: 0x03080b,
    caution: 0xffb000,
    warning: 0xff3b30,
};
export const selectionColor = 0x00ffff; // Pure cyan

export const radarVisibleBg = 0x0a0a0a; // --bg-primary
export const radarFogOfWar = 0x1a1a1a; // --bg-tertiary

// ============================================================================
// Radar-Specific Colors
// ============================================================================
export const radar = {
    ringLine: 0x123a42, // Readout frame colour - thin dim range rings and anchor dots
    rangeLabel: 0x2f7480, // Dim range labels
    bearingLabel: 0x52aebb, // Readout label colour
    ownShip: 0x5fe3f0, // Readout accent cyan
    scanWedge: 0x5fe3f0, // Translucent fill and accent edge of the steerable scan wedge
    lockBox: status.caution, // Amber box on the tracked target
    mask: 0xffffff, // Never visible - only the shape of a mask matters
    speedLine: 0x5fe3f0, // Readout accent cyan
    targetSpeedLine: 0x52aebb, // Readout label colour
    collisionOutline: 0x4ce73c, // Green (danger indicator)
    azimuthTint: 0x52aebb, // Readout label colour - bearing ring labels
    shellTint: 0xff6600, // Orange (secondary)
    deflectionTint: 0x00aaff, // Cyan-blue
    unknownTint: 0x666666, // Dim gray for UFO/unscanned objects
    mountArc: 0x888888, // Dim gray - static structural firing arc, not a live overlay
    derelictTint: 0x3a3a3a, // Darker than unknownTint - an inert hulk, not just unidentified
    nebulaTint: 0xff66cc, // Pink - a visible optical hazard, not a faction-colored contact
};

/** DRADIS grid, finest to coarsest, brightening with each level; the coarsest is amber. */
export const gridColors = [0x0c2a31, 0x0e3038, radar.ringLine, 0x1b5560, radar.rangeLabel, status.caution];

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
