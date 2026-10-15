import { Declutter, DeclutterItem, DeclutterResult, Viewport, isExempt, visibleKind } from '../declutter';
import { DradisGroupMarker, DradisPoiMarker } from './blip-renderer';
import { Faction, ScanLevel, SpaceObject } from '@starwards/core';
import { white, yellow } from '../../colors';
import { Container } from 'pixi.js';
import { DrawnBlip } from './objects-layer';

function isNamed(o: SpaceObject, scanLevel: ScanLevel) {
    // a callsign is only known from BASIC up; exempting unscanned named contacts would mark them as ships
    return scanLevel >= ScanLevel.BASIC && 'callsign' in o && Boolean(o.callsign);
}

/**
 * Applies the declutter ladder to an `ObjectsLayer`'s blips each frame and draws the group and POI
 * markers. Install with `objectsLayer.layout = declutterLayer.layout`. Pass `view` to enable rung 4
 * (POI); an inset's layer leaves it out, so rung 4 never recurses.
 */
export class DeclutterLayer {
    private readonly stage = new Container();
    private readonly declutter: Declutter;
    private markers = new Map<string, DradisGroupMarker>();
    private poiMarkers = new Map<string, DradisPoiMarker>();
    private last: DeclutterResult = { placements: new Map(), groups: [], pois: [] };

    constructor(
        private readonly blipSize: number,
        private readonly playerFaction: Faction,
        private readonly view?: () => Viewport,
        private readonly now: () => number = () => performance.now(),
    ) {
        this.declutter = new Declutter(blipSize, Boolean(view));
    }

    get renderRoot(): Container {
        return this.stage;
    }

    get result(): DeclutterResult {
        return this.last;
    }

    public layout = (blips: DrawnBlip[]) => {
        const colors = new Map<string, number>();
        const items: DeclutterItem[] = blips.map(({ object, data }) => {
            colors.set(object.id, data.color);
            return {
                id: object.id,
                x: data.stage.x,
                y: data.stage.y,
                world: object.position,
                kind: visibleKind(object.type, data.scanLevel),
                exempt: isExempt({
                    named: isNamed(object, data.scanLevel),
                    selected: data.isSelected,
                    ownFaction: object.faction === this.playerFaction && this.playerFaction !== Faction.NONE,
                }),
            };
        });
        this.last = this.declutter.update(items, this.now(), this.view?.());
        for (const { data, object } of blips) {
            const p = this.last.placements.get(object.id);
            if (!p) continue;
            data.stage.x = p.x;
            data.stage.y = p.y;
            data.stage.scale.set(p.scale);
            data.stage.visible = p.visible;
        }
        this.drawMarkers(colors);
    };

    private drawMarkers(colors: Map<string, number>) {
        const live = new Set<string>();
        for (const group of this.last.groups) {
            const key = `${group.kind}:${group.key}`;
            live.add(key);
            let marker = this.markers.get(key);
            if (!marker) {
                marker = new DradisGroupMarker(this.blipSize, group.kind);
                this.markers.set(key, marker);
                this.stage.addChild(marker.stage);
            }
            marker.redraw(group.x, group.y, group.badge, colors.get(group.memberIds[0]) ?? white);
        }
        for (const poi of this.last.pois) {
            const key = `poi:${poi.key}`;
            live.add(key);
            let marker = this.poiMarkers.get(key);
            if (!marker) {
                marker = new DradisPoiMarker(this.blipSize);
                this.poiMarkers.set(key, marker);
                this.stage.addChild(marker.stage);
            }
            const tints = new Set(poi.memberIds.map((id) => colors.get(id)));
            const tint = tints.size === 1 ? ([...tints][0] ?? yellow) : yellow;
            marker.redraw(poi.x, poi.y, poi.badge, tint);
        }
        for (const markers of [this.markers, this.poiMarkers]) {
            for (const [key, marker] of markers) {
                if (!live.has(key)) {
                    marker.stage.destroy({ children: true });
                    markers.delete(key);
                }
            }
        }
    }
}
