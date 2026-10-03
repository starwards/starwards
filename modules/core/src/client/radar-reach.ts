import { StationRadarWidget } from '../stations-manifest';
import { XY } from '../logic/xy';

/**
 * How far from the own ship each station radar draws, in meters.
 *
 * Every ship radar masks its blips to a circle of its camera range around the own ship, so the reach
 * is the second half of "what this station sees" after the faction field of view. The browser screens
 * draw at these ranges and headless seats cut their contact lists with `isWithinRadarReach`.
 *
 * - helms: 5 km, 100 km at warp (warp level above 0.5). At warp the browser draws a forward cone whose
 *   width follows the panel's aspect ratio; only the range is cut here.
 * - tactical: the weapons screen draws 10 km.
 * - long range: the signals screen opens at 50 km; the operator can zoom between 5 and 250 km.
 * - dradis: the screen opens with 50 km from centre to the top edge; zoom is free and the panel is
 *   wider than tall, so 50 km is the shortest reach the default view shows.
 */
export const radarReach = {
    helms: 5_000,
    helmsWarp: 100_000,
    tactical: 10_000,
    longRange: 50_000,
    dradis: 50_000,
} as const;

export function helmsRadarReach(warpLevel: number | undefined): number {
    return (warpLevel ?? 0) > 0.5 ? radarReach.helmsWarp : radarReach.helms;
}

/** The reach of one station radar; `warpLevel` matters only to the helms radar. */
export function radarWidgetReach(widget: StationRadarWidget, warpLevel: number | undefined): number {
    switch (widget) {
        case 'helms-radar':
            return helmsRadarReach(warpLevel);
        case 'tactical-radar':
            return radarReach.tactical;
        case 'long-range-radar':
            return radarReach.longRange;
        case 'dradis-radar':
            return radarReach.dradis;
    }
}

/** Whether a radar centred on `center` with `reach` draws an object at `position`. */
export function isWithinRadarReach(center: XY, position: XY, reach: number): boolean {
    return XY.lengthOf(XY.difference(position, center)) <= reach;
}
