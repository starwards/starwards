import { Declutter, DeclutterItem, DeclutterResult, isExempt, visibleKind } from '../declutter';
import { Faction, ScanLevel, SpaceObject } from '@starwards/core';
import { Container } from 'pixi.js';
import { DradisGroupMarker } from './blip-renderer';
import { DrawnBlip } from './objects-layer';
import { white } from '../../colors';

function isNamed(o: SpaceObject, scanLevel: ScanLevel) {
    // a callsign is only known from BASIC up; exempting unscanned named contacts would mark them as ships
    return scanLevel >= ScanLevel.BASIC && 'callsign' in o && Boolean(o.callsign);
}

/**
 * Applies the declutter ladder to an `ObjectsLayer`'s blips each frame and draws the group markers.
 * Install with `objectsLayer.layout = declutterLayer.layout`.
 */
export class DeclutterLayer {
    private readonly stage = new Container();
    private readonly declutter: Declutter;
    private markers = new Map<string, DradisGroupMarker>();
    private last: DeclutterResult = { placements: new Map(), groups: [] };

    constructor(
        private readonly blipSize: number,
        private readonly playerFaction: Faction,
        private readonly now: () => number = () => performance.now(),
    ) {
        this.declutter = new Declutter(blipSize);
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
                kind: visibleKind(object.type, data.scanLevel),
                exempt: isExempt({
                    named: isNamed(object, data.scanLevel),
                    selected: data.isSelected,
                    ownFaction: object.faction === this.playerFaction && this.playerFaction !== Faction.NONE,
                }),
            };
        });
        this.last = this.declutter.update(items, this.now());
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
        for (const [key, marker] of this.markers) {
            if (!live.has(key)) {
                marker.stage.destroy({ children: true });
                this.markers.delete(key);
            }
        }
    }
}
