import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import {
    Asteroid,
    Derelict,
    Explosion,
    Nebula,
    ScanLevel,
    ShipModel,
    SpaceObject,
    Spaceship,
    Waypoint,
    objectDisplayName,
} from '@starwards/core';
import { radar, selectionColor, white } from '../../colors';

import { CameraView } from '../camera-view';
import { resolveShipBlipAsset } from './ship-blip-assets';

export interface BlipData {
    isSelected: boolean;
    color: number;
    alpha: number;
    stage: Container;
    parent: CameraView;
    blipSize: number;
    scanLevel: ScanLevel;
}

export interface BlipRenderer<T extends SpaceObject> {
    redraw(spaceObject: T, data: BlipData): void;
}

export function renderText(y: number, value: string[], color: number) {
    const result = new Text(
        value.join('\n'),
        new TextStyle({
            fontFamily: 'Bebas',
            fontSize: 14,
            fill: color,
            align: 'left',
        }),
    );
    result.y = y;
    result.x = -result.getLocalBounds().width / 2;
    result.label = BLIP_LABEL;
    return result;
}

/** Pixi `label` of a blip's name text; radars read visible ones back for their `data-labels` attribute. */
export const BLIP_LABEL = 'blip-label';
/** Pixi `label` of a blip's heading sprite; radars count visible ones for their `data-direction-sprites` attribute. */
export const DIRECTION_SPRITE_LABEL = 'direction-sprite';

const textures = {
    dradis_fighter: 'images/dradis/fighter.png',
    dradis_station: 'images/dradis/station.png',
    dradis_asteroid: 'images/dradis/asteroid.png',
    dradis_circleBase: 'images/dradis/circle-base.png',
    dradis_circleBevel: 'images/dradis/circle-bevel.png',
    dradis_direction: 'images/dradis/direction.png',
    dradis_select: 'images/dradis/select.png',
    tactical_fighter: 'images/tactical_radar/dragonfly.png',
    tactical_station: 'images/tactical_radar/station.png',
    tactical_waypoint: 'images/tactical_radar/waypoint_triangle.svg',
    tactical_select: 'images/tactical_radar/selection.png',
};

Assets.addBundle('blips', textures);
const blipAssets = Assets.loadBundle('blips') as Promise<Record<keyof typeof textures, Texture>>;

function shipBlipTexture(prefix: 'dradis' | 'tactical', model: ShipModel | null): keyof typeof textures {
    return `${prefix}_${resolveShipBlipAsset(model)}`;
}

function blipSprite(t: keyof typeof textures, size: number, color: number) {
    const radarBlipSprite = new Sprite(undefined);
    void blipAssets.then((a) => {
        // SVG bug https://github.com/pixijs/pixijs/issues/8694#issuecomment-1320702841
        radarBlipSprite.texture = textures[t].includes('svg') ? Texture.from(textures[t]) : a[t];
    });
    radarBlipSprite.tint = color;
    radarBlipSprite.height = size;
    radarBlipSprite.width = size;
    radarBlipSprite.anchor.set(0.5);
    return radarBlipSprite;
}

class DradisSpaceshipRenderer implements BlipRenderer<Spaceship> {
    protected readonly showRadius: boolean = true;
    protected readonly showDirection: boolean = true;
    protected labelText(spaceObject: Spaceship, _scanLevel: ScanLevel) {
        return `ID: ${spaceObject.id}`;
    }
    private selectionSprite = blipSprite('dradis_select', this.blipSize, selectionColor);
    private directionSprite = blipSprite('dradis_direction', this.blipSize, white);
    private circleBaseSprite = blipSprite('dradis_circleBase', this.blipSize, white);
    private circleBevelSprite = blipSprite('dradis_circleBevel', this.blipSize, white);
    private fighterSprite = blipSprite(shipBlipTexture('dradis', this.spaceObject.model), this.blipSize, white);
    private text = renderText(this.blipSize / 2, [], white);
    private collisionOutline = new Graphics();

    constructor(
        stage: Container,
        private blipSize: number,
        private spaceObject: Spaceship,
    ) {
        this.directionSprite.label = DIRECTION_SPRITE_LABEL;
        // hidden until the first redraw, which skips blips created off screen
        this.directionSprite.visible = false;
        this.text.visible = false;
        stage.addChild(this.directionSprite);
        stage.addChild(this.circleBaseSprite);
        stage.addChild(this.circleBevelSprite);
        stage.addChild(this.fighterSprite);
        stage.addChild(this.text);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }

    redraw(spaceObject: Spaceship, { parent, isSelected, color, alpha, scanLevel }: BlipData): void {
        const identified = scanLevel >= ScanLevel.BASIC;
        this.fighterSprite.visible = identified;
        this.directionSprite.visible = identified && this.showDirection;
        this.text.visible = identified;
        if (identified) {
            this.directionSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
            this.text.text = this.labelText(spaceObject, scanLevel);
            this.text.x = -this.text.getLocalBounds().width / 2;
            this.fighterSprite.tint = color;
            this.fighterSprite.alpha = alpha;
        }
        this.collisionOutline.clear();
        if (this.showRadius) {
            this.collisionOutline
                .circle(0, 0, parent.metersToPixles(spaceObject.radius))
                .stroke({ width: 1, color: identified ? radar.collisionOutline : color, alpha: 0.5 });
        }
        this.selectionSprite.visible = isSelected;
        this.circleBevelSprite.tint = color;
        this.circleBevelSprite.alpha = alpha;
    }
}
class DradisDerelictRenderer implements BlipRenderer<Derelict> {
    protected readonly showRadius: boolean = true;
    protected labelText(spaceObject: Derelict, _scanLevel: ScanLevel) {
        return `ID: ${spaceObject.id}`;
    }
    private selectionSprite = blipSprite('dradis_select', this.blipSize, selectionColor);
    private circleBaseSprite = blipSprite('dradis_circleBase', this.blipSize, white);
    private circleBevelSprite = blipSprite('dradis_circleBevel', this.blipSize, white);
    private fighterSprite = blipSprite(shipBlipTexture('dradis', this.spaceObject.model), this.blipSize, white);
    private text = renderText(this.blipSize / 2, [], white);
    private collisionOutline = new Graphics();

    constructor(
        stage: Container,
        private blipSize: number,
        private spaceObject: Derelict,
    ) {
        this.text.visible = false;
        stage.addChild(this.circleBaseSprite);
        stage.addChild(this.circleBevelSprite);
        stage.addChild(this.fighterSprite);
        stage.addChild(this.text);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }

    redraw(spaceObject: Derelict, { parent, isSelected, alpha, scanLevel }: BlipData): void {
        const identified = scanLevel >= ScanLevel.BASIC;
        this.fighterSprite.visible = identified;
        this.text.visible = identified;
        if (identified) {
            this.text.text = this.labelText(spaceObject, scanLevel);
            this.text.x = -this.text.getLocalBounds().width / 2;
            this.fighterSprite.tint = radar.derelictTint;
            this.fighterSprite.alpha = alpha;
        }
        this.collisionOutline.clear();
        if (this.showRadius) {
            this.collisionOutline
                .circle(0, 0, parent.metersToPixles(spaceObject.radius))
                .stroke({ width: 1, color: radar.collisionOutline, alpha: 0.5 });
        }
        this.selectionSprite.visible = isSelected;
        this.circleBevelSprite.tint = radar.derelictTint;
        this.circleBevelSprite.alpha = alpha;
    }
}
class DradisAsteroidRenderer implements BlipRenderer<Asteroid> {
    protected readonly showRadius: boolean = true;
    private selectionSprite = blipSprite('dradis_select', this.blipSize, selectionColor);
    private circleBaseSprite = blipSprite('dradis_circleBase', this.blipSize, white);
    private circleBevelSprite = blipSprite('dradis_circleBevel', this.blipSize, white);
    private asteroidSprite = blipSprite('dradis_asteroid', this.blipSize, white);
    private collisionOutline = new Graphics();
    constructor(
        stage: Container,
        private blipSize: number,
    ) {
        stage.addChild(this.circleBaseSprite);
        stage.addChild(this.circleBevelSprite);
        stage.addChild(this.asteroidSprite);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }
    redraw(spaceObject: Asteroid, { parent, isSelected, color, alpha }: BlipData): void {
        this.collisionOutline.clear();
        if (this.showRadius) {
            this.collisionOutline
                .circle(0, 0, parent.metersToPixles(spaceObject.radius))
                .stroke({ width: 1, color: radar.collisionOutline, alpha: 0.5 });
        }
        this.selectionSprite.visible = isSelected;
        this.circleBevelSprite.tint = color;
        this.circleBevelSprite.alpha = alpha;
        this.asteroidSprite.tint = color;
        this.asteroidSprite.alpha = alpha;
    }
}

// bright inner flash marking a hit that punched through already-breached armor
const BREACH_FLASH_SCALE = 0.4;

class CircleRenderer implements BlipRenderer<SpaceObject> {
    private shellCircle = new Graphics();
    private breachFlash = new Graphics();
    private selectionSprite = blipSprite('tactical_select', this.blipSize, radar.lockBox);
    constructor(
        stage: Container,
        private blipSize: number,
    ) {
        stage.addChild(this.shellCircle);
        stage.addChild(this.breachFlash);
        stage.addChild(this.selectionSprite);
    }
    redraw(spaceObject: SpaceObject, { parent, isSelected, blipSize, color, alpha }: BlipData): void {
        const radius = Math.max(parent.metersToPixles(spaceObject.radius), 2);
        this.shellCircle.clear();
        this.shellCircle.circle(0, 0, radius).fill({ color, alpha });
        this.breachFlash.clear();
        if (Explosion.isInstance(spaceObject) && spaceObject.breachHit) {
            this.breachFlash.circle(0, 0, radius * BREACH_FLASH_SCALE).fill({ color: white, alpha });
        }
        this.selectionSprite.visible = isSelected;
        this.selectionSprite.height = blipSize;
        this.selectionSprite.width = blipSize;
    }
}

/**
 * A nebula is a visible optical hazard, not a scanned contact: it always draws in a fixed
 * semi-transparent pink, ignoring scan level / faction color like a ship or asteroid blip would use.
 */
class NebulaRenderer implements BlipRenderer<Nebula> {
    private shellCircle = new Graphics();
    private selectionSprite = blipSprite('tactical_select', this.blipSize, radar.lockBox);
    constructor(
        stage: Container,
        private blipSize: number,
    ) {
        stage.addChild(this.shellCircle);
        stage.addChild(this.selectionSprite);
    }
    redraw(spaceObject: Nebula, { parent, isSelected, blipSize }: BlipData): void {
        const radius = Math.max(parent.metersToPixles(spaceObject.radius), 2);
        this.shellCircle.clear();
        this.shellCircle.circle(0, 0, radius).fill({ color: radar.nebulaTint, alpha: 0.25 });
        this.selectionSprite.visible = isSelected;
        this.selectionSprite.height = blipSize;
        this.selectionSprite.width = blipSize;
    }
}
class TacticalSpaceshipRenderer implements BlipRenderer<Spaceship> {
    private selectionSprite = blipSprite('tactical_select', this.blipSize, radar.lockBox);
    private fighterSprite = blipSprite(shipBlipTexture('tactical', this.spaceObject.model), this.blipSize, white);
    private text = renderText(this.blipSize / 2, [], white);
    private collisionOutline = new Graphics();

    constructor(
        stage: Container,
        private blipSize: number,
        private spaceObject: Spaceship,
    ) {
        stage.addChild(this.fighterSprite);
        stage.addChild(this.text);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }

    redraw(spaceObject: Spaceship, { parent, isSelected, blipSize, color, alpha, scanLevel }: BlipData): void {
        const identified = scanLevel >= ScanLevel.BASIC;
        this.fighterSprite.visible = identified;
        this.text.visible = identified;
        if (identified) {
            this.fighterSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
            this.fighterSprite.tint = color;
            this.fighterSprite.alpha = alpha;
            this.fighterSprite.height = blipSize;
            this.fighterSprite.width = blipSize;
            this.text.text = `ID: ${spaceObject.id}`;
            this.text.x = -this.text.getLocalBounds().width / 2;
        }
        this.collisionOutline.clear();
        this.collisionOutline
            .circle(0, 0, parent.metersToPixles(spaceObject.radius))
            .stroke({ width: 1, color: identified ? radar.collisionOutline : color, alpha: 0.5 });
        this.selectionSprite.visible = isSelected;
        this.selectionSprite.height = blipSize;
        this.selectionSprite.width = blipSize;
    }
}
class TacticalDerelictRenderer implements BlipRenderer<Derelict> {
    private selectionSprite = blipSprite('tactical_select', this.blipSize, radar.lockBox);
    private fighterSprite = blipSprite(shipBlipTexture('tactical', this.spaceObject.model), this.blipSize, white);
    private text = renderText(this.blipSize / 2, [], white);
    private collisionOutline = new Graphics();

    constructor(
        stage: Container,
        private blipSize: number,
        private spaceObject: Derelict,
    ) {
        stage.addChild(this.fighterSprite);
        stage.addChild(this.text);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }

    redraw(spaceObject: Derelict, { parent, isSelected, blipSize, alpha, scanLevel }: BlipData): void {
        const identified = scanLevel >= ScanLevel.BASIC;
        this.fighterSprite.visible = identified;
        this.text.visible = identified;
        if (identified) {
            this.fighterSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
            this.fighterSprite.tint = radar.derelictTint;
            this.fighterSprite.alpha = alpha;
            this.fighterSprite.height = blipSize;
            this.fighterSprite.width = blipSize;
            this.text.text = `ID: ${spaceObject.id}`;
            this.text.x = -this.text.getLocalBounds().width / 2;
        }
        this.collisionOutline.clear();
        this.collisionOutline
            .circle(0, 0, parent.metersToPixles(spaceObject.radius))
            .stroke({ width: 1, color: radar.collisionOutline, alpha: 0.5 });
        this.selectionSprite.visible = isSelected;
        this.selectionSprite.height = blipSize;
        this.selectionSprite.width = blipSize;
    }
}
class TacticalWaypointRenderer implements BlipRenderer<Waypoint> {
    private selectionSprite = blipSprite('tactical_select', this.blipSize, radar.lockBox);
    private iconSprite = blipSprite('tactical_waypoint', this.blipSize, white);
    private text = renderText(this.blipSize / 2, [], white);

    constructor(
        stage: Container,
        private blipSize: number,
    ) {
        stage.addChild(this.iconSprite);
        stage.addChild(this.text);
        stage.addChild(this.selectionSprite);
    }

    redraw(spaceObject: Waypoint, { isSelected, blipSize, color, alpha }: BlipData): void {
        this.iconSprite.tint = color;
        this.iconSprite.alpha = alpha;
        this.iconSprite.height = blipSize;
        this.iconSprite.width = blipSize;
        this.text.alpha = alpha;
        this.text.text = `${spaceObject.title}`;
        this.text.x = -this.text.getLocalBounds().width / 2;
        this.selectionSprite.visible = isSelected;
        this.selectionSprite.height = blipSize;
        this.selectionSprite.width = blipSize;
    }
}

export const dradisDrawFunctions = {
    Spaceship: DradisSpaceshipRenderer,
    Asteroid: DradisAsteroidRenderer,
    Derelict: DradisDerelictRenderer,
};

/** Dradis station blips: no heading, and the speakable name instead of the raw id (SPEC-0007 D1, D2). */
class DradisNoRadiusSpaceshipRenderer extends DradisSpaceshipRenderer {
    protected override readonly showRadius = false;
    protected override readonly showDirection = false;
    protected override labelText(spaceObject: Spaceship, scanLevel: ScanLevel) {
        return objectDisplayName(spaceObject, spaceObject.id, scanLevel);
    }
}
class DradisNoRadiusAsteroidRenderer extends DradisAsteroidRenderer {
    protected override readonly showRadius = false;
}
class DradisNoRadiusDerelictRenderer extends DradisDerelictRenderer {
    protected override readonly showRadius = false;
    protected override labelText(spaceObject: Derelict, scanLevel: ScanLevel) {
        return objectDisplayName(spaceObject, spaceObject.id, scanLevel);
    }
}

export const dradisNoRadiusDrawFunctions = {
    Spaceship: DradisNoRadiusSpaceshipRenderer,
    Asteroid: DradisNoRadiusAsteroidRenderer,
    Derelict: DradisNoRadiusDerelictRenderer,
};

export const tacticalDrawWaypoints = {
    Waypoint: TacticalWaypointRenderer,
};

export const tacticalDrawFunctions = {
    Spaceship: TacticalSpaceshipRenderer,
    Asteroid: CircleRenderer,
    Projectile: CircleRenderer,
    Explosion: CircleRenderer,
    Nebula: NebulaRenderer,
    Derelict: TacticalDerelictRenderer,
};

/** Pixi `label` of a declutter group's count badge. */
export const GROUP_BADGE_LABEL = 'group-badge';

const groupIconTexture: Partial<Record<string, keyof typeof textures>> = {
    Asteroid: 'dradis_asteroid',
    Spaceship: 'dradis_fighter',
    Derelict: 'dradis_fighter',
};

/** One Dradis icon standing for a same-kind cluster, with its count badge (SPEC-0007 D3 rung 3). */
export class DradisGroupMarker {
    public readonly stage = new Container();
    private circleBaseSprite = blipSprite('dradis_circleBase', this.blipSize, white);
    private circleBevelSprite = blipSprite('dradis_circleBevel', this.blipSize, white);
    private iconSprite: Sprite | null;
    private badge = renderText(-this.blipSize / 2, [], white);

    constructor(
        private blipSize: number,
        kind: string,
    ) {
        const texture = groupIconTexture[kind];
        this.iconSprite = texture ? blipSprite(texture, blipSize, white) : null;
        this.badge.label = GROUP_BADGE_LABEL;
        this.stage.addChild(this.circleBaseSprite);
        this.stage.addChild(this.circleBevelSprite);
        if (this.iconSprite) this.stage.addChild(this.iconSprite);
        this.stage.addChild(this.badge);
    }

    redraw(x: number, y: number, badge: string, color: number) {
        this.stage.x = x;
        this.stage.y = y;
        this.circleBevelSprite.tint = color;
        if (this.iconSprite) this.iconSprite.tint = color;
        this.badge.text = badge;
        this.badge.style.fill = color;
        this.badge.x = this.blipSize / 2 - this.badge.getLocalBounds().width;
    }
}

/** Pixi `label` of a POI marker's count badge. */
export const POI_BADGE_LABEL = 'poi-badge';

/** Rung 4 point of interest: a ring with the super-cluster's total-count badge (SPEC-0007 D4). */
export class DradisPoiMarker {
    public readonly stage = new Container();
    private ring = new Graphics();
    private badge = renderText(-this.blipSize / 2, [], white);

    constructor(private blipSize: number) {
        this.badge.label = POI_BADGE_LABEL;
        this.stage.addChild(this.ring);
        this.stage.addChild(this.badge);
    }

    redraw(x: number, y: number, badge: string, color: number) {
        this.stage.x = x;
        this.stage.y = y;
        const r = this.blipSize / 2;
        this.ring.clear();
        this.ring.circle(0, 0, r - 2).stroke({ width: 3, color });
        this.ring.circle(0, 0, r / 3).stroke({ width: 2, color });
        this.badge.text = badge;
        this.badge.style.fill = color;
        this.badge.x = r - this.badge.getLocalBounds().width;
    }
}
