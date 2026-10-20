import { Container, Graphics, Text, Ticker } from 'pixi.js';
import { DECLUTTER, Poi, Region, Viewport, insetRect, insetZoom } from './declutter';
import { Faction, SpaceDriver, SpaceObject, XY } from '@starwards/core';
import { ObjectsLayer, Selection } from './blips/objects-layer';
import { dradisNoRadiusDrawFunctions, renderText } from './blips/blip-renderer';
import { radar, radarFogOfWar, white } from '../colors';

import { Camera } from './camera';
import { CameraView } from './camera-view';
import { DeclutterLayer } from './blips/declutter-layer';

type Rect = { x: number; y: number; side: number };

function regionCenter(region: Region): XY {
    return { x: (region.minX + region.maxX) / 2, y: (region.minY + region.maxY) / 2 };
}

/** The point of `rect` nearest to `p`. */
function nearestOnRect(rect: Rect, p: XY): XY {
    return {
        x: Math.max(rect.x, Math.min(rect.x + rect.side, p.x)),
        y: Math.max(rect.y, Math.min(rect.y + rect.side, p.y)),
    };
}

/**
 * The slice of `CameraView` that `ObjectsLayer` and the blip renderers use, over a square panel
 * instead of a canvas. Lets an inset reuse the Dradis renderers inside the main canvas, so no
 * second WebGL context is needed.
 */
class PanelView {
    public readonly camera = new Camera();
    public readonly renderer = { width: 0, height: 0 };
    constructor(public readonly ticker: Ticker) {}
    public worldToScreen = (w: XY) => this.camera.worldToScreen(this.renderer, w.x, w.y);
    public metersToPixles = (m: number) => m * this.camera.zoom;
}

/** One inset panel: a framed, masked mini-radar of a POI's region (SPEC-0007 D4). */
class InsetPanel {
    public readonly stage = new Container();
    private readonly view: PanelView;
    private readonly background = new Graphics();
    private readonly frame = new Graphics();
    private readonly mask = new Graphics();
    private readonly caption: Text = renderText(0, [], white);
    public rect: Rect | null = null;

    constructor(
        root: CameraView,
        spaceDriver: SpaceDriver,
        blipSize: number,
        getColor: (o: SpaceObject) => number,
        selection: Selection,
        isInRange: (o: SpaceObject) => boolean,
        playerFaction: Faction,
    ) {
        this.view = new PanelView(root.ticker);
        const asParent = this.view as unknown as CameraView;
        const blips = new ObjectsLayer(
            asParent,
            spaceDriver,
            blipSize,
            getColor,
            dradisNoRadiusDrawFunctions,
            selection,
            isInRange,
            undefined,
            undefined,
            playerFaction,
        );
        // rungs 1-3 re-run at the inset's zoom; no view, so rung 4 never recurses
        const declutter = new DeclutterLayer(blipSize, playerFaction);
        blips.layout = declutter.layout;
        const content = new Container();
        content.addChild(this.background, declutter.renderRoot, blips.renderRoot);
        content.mask = this.mask;
        this.stage.addChild(content, this.mask, this.frame, this.caption);
        this.stage.visible = false;
    }

    show(rect: Rect, poi: Poi) {
        this.rect = rect;
        this.stage.visible = true;
        this.stage.x = rect.x;
        this.stage.y = rect.y;
        this.view.renderer.width = rect.side;
        this.view.renderer.height = rect.side;
        this.view.camera.set(regionCenter(poi.region));
        this.view.camera.setZoom(insetZoom(poi.region, rect.side));
        for (const g of [this.background, this.mask]) {
            g.clear();
            g.rect(0, 0, rect.side, rect.side).fill({ color: radarFogOfWar });
        }
        this.frame.clear();
        this.frame.rect(0, 0, rect.side, rect.side).stroke({ width: 1, color: radar.ringLine, alignment: 1 });
        this.caption.text = `${poi.memberIds.length} objects`;
        this.caption.x = 4;
        this.caption.y = 2;
    }

    hide() {
        this.rect = null;
        this.stage.visible = false;
    }
}

/**
 * Inset panels on the Dradis canvas's left edge and the leader lines from their POIs. Clicking a
 * panel or a POI marker zooms the main camera onto its region and selects nothing.
 */
export class DradisInsets {
    public readonly renderRoot = new Container();
    private readonly lines = new Graphics();
    private readonly panels: InsetPanel[] = [];
    private pois: Poi[] = [];

    constructor(
        private readonly root: CameraView,
        spaceDriver: SpaceDriver,
        private readonly blipSize: number,
        getColor: (o: SpaceObject) => number,
        selection: Selection,
        isInRange: (o: SpaceObject) => boolean,
        playerFaction: Faction,
        private readonly offsetX: () => number,
    ) {
        this.renderRoot.addChild(this.lines);
        for (let slot = 0; slot < DECLUTTER.maxInsets; slot++) {
            const panel = new InsetPanel(root, spaceDriver, blipSize, getColor, selection, isInRange, playerFaction);
            this.panels.push(panel);
            this.renderRoot.addChild(panel.stage);
        }
    }

    get viewport(): Viewport {
        return { width: this.root.renderer.width, height: this.root.renderer.height };
    }

    get insetRects(): Rect[] {
        return this.panels.flatMap((p) => (p.rect ? [p.rect] : []));
    }

    update(pois: Poi[]) {
        this.pois = pois;
        this.lines.clear();
        this.panels.forEach((panel, slot) => {
            const poi = pois.find((p) => p.slot === slot);
            if (!poi) return panel.hide();
            const rect = insetRect(this.viewport, slot, this.offsetX());
            panel.show(rect, poi);
            const end = nearestOnRect(rect, poi);
            this.lines.moveTo(poi.x, poi.y).lineTo(end.x, end.y).stroke({ width: 1, color: radar.ringLine });
        });
    }

    /** The region to zoom onto, and the zoom, for a click at canvas point `p`; null when it misses. */
    hit(p: XY): { center: XY; zoom: number } | null {
        const side = insetRect(this.viewport, 0).side;
        for (const poi of this.pois) {
            const rect = poi.slot === null ? null : this.panels[poi.slot].rect;
            const onPanel =
                rect && p.x >= rect.x && p.x <= rect.x + rect.side && p.y >= rect.y && p.y <= rect.y + rect.side;
            const onMarker = XY.lengthOf(XY.difference(p, poi)) <= this.blipSize / 2;
            if (onPanel || onMarker) return { center: regionCenter(poi.region), zoom: insetZoom(poi.region, side) };
        }
        return null;
    }
}
