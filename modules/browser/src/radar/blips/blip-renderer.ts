import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { Asteroid, Derelict, Nebula, ScanLevel, ShipModel, SpaceObject, Spaceship, Waypoint } from '@starwards/core';
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

function renderText(y: number, value: string[], color: number) {
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
    return result;
}

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
        this.directionSprite.visible = identified;
        this.text.visible = identified;
        if (identified) {
            this.directionSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
            this.text.text = `ID: ${spaceObject.id}`;
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
            this.text.text = `ID: ${spaceObject.id}`;
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

class CircleRenderer implements BlipRenderer<SpaceObject> {
    private shellCircle = new Graphics();
    private selectionSprite = blipSprite('tactical_select', this.blipSize, selectionColor);
    constructor(
        stage: Container,
        private blipSize: number,
    ) {
        stage.addChild(this.shellCircle);
        stage.addChild(this.selectionSprite);
    }
    redraw(spaceObject: SpaceObject, { parent, isSelected, blipSize, color, alpha }: BlipData): void {
        const radius = Math.max(parent.metersToPixles(spaceObject.radius), 2);
        this.shellCircle.clear();
        this.shellCircle.circle(0, 0, radius).fill({ color, alpha });
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
    private selectionSprite = blipSprite('tactical_select', this.blipSize, selectionColor);
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
    private selectionSprite = blipSprite('tactical_select', this.blipSize, selectionColor);
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
    private selectionSprite = blipSprite('tactical_select', this.blipSize, selectionColor);
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
    private selectionSprite = blipSprite('tactical_select', this.blipSize, selectionColor);
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

class DradisNoRadiusSpaceshipRenderer extends DradisSpaceshipRenderer {
    protected override readonly showRadius = false;
}
class DradisNoRadiusAsteroidRenderer extends DradisAsteroidRenderer {
    protected override readonly showRadius = false;
}
class DradisNoRadiusDerelictRenderer extends DradisDerelictRenderer {
    protected override readonly showRadius = false;
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
