import { Asteroid, SpaceObject, Spaceship, Waypoint } from '@starwards/core';
import { Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { selectionColor, white } from '../../colors';

import { Assets } from '@pixi/assets';
import { CameraView } from '../camera-view';

export interface BlipData {
    isSelected: boolean;
    color: number;
    alpha: number;
    stage: Container;
    parent: CameraView;
    blipSize: number;
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
        })
    );
    result.y = y;
    result.x = -result.getLocalBounds(new Rectangle()).width / 2;
    return result;
}

const textures = {
    dradis_fighter: 'images/dradis/fighter.png',
    dradis_asteroid: 'images/dradis/asteroid.png',
    dradis_circleBase: 'images/dradis/circle-base.png',
    dradis_circleBevel: 'images/dradis/circle-bevel.png',
    dradis_direction: 'images/dradis/direction.png',
    dradis_select: 'images/dradis/select.png',
    tactical_fighter: 'images/tactical_radar/dragonfly.png',
    tactical_waypoint: 'images/tactical_radar/waypoint_triangle.svg',
    tactical_select: 'images/tactical_radar/selection.png',
};

function blipSprite(t: keyof typeof textures, size: number, color: number) {
    const texturePath = textures[t];
    const radarBlipTexture = Assets.get(texturePath) as Texture;
    const radarBlipSprite = new Sprite(radarBlipTexture);
    if (!radarBlipTexture) {
        void Assets.load(texturePath).then((texture: Texture) => {
            radarBlipSprite.texture = texture;
        });
    }
    radarBlipSprite.tint = color;
    radarBlipSprite.height = size;
    radarBlipSprite.width = size;
    radarBlipSprite.anchor.set(0.5);
    return radarBlipSprite;
}

class DradisSpaceshipRenderer implements BlipRenderer<Spaceship> {
    private selectionSprite = blipSprite('dradis_select', this.blipSize, selectionColor);
    private directionSprite = blipSprite('dradis_direction', this.blipSize, white);
    private circleBaseSprite = blipSprite('dradis_circleBase', this.blipSize, white);
    private circleBevelSprite = blipSprite('dradis_circleBevel', this.blipSize, white);
    private fighterSprite = blipSprite('dradis_fighter', this.blipSize, white);
    private text = renderText(this.blipSize / 2, [], white);
    private collisionOutline = new Graphics();

    constructor(stage: Container, private blipSize: number) {
        stage.addChild(this.directionSprite);
        stage.addChild(this.circleBaseSprite);
        stage.addChild(this.circleBevelSprite);
        stage.addChild(this.fighterSprite);
        stage.addChild(this.text);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }

    redraw(spaceObject: Spaceship, { parent, isSelected, color, alpha }: BlipData): void {
        this.directionSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
        this.text.text = `ID: ${spaceObject.id}`;
        this.text.x = -this.text.getLocalBounds(new Rectangle()).width / 2;
        this.collisionOutline.clear();
        this.collisionOutline.lineStyle(1, 0x4ce73c, 0.5);
        this.collisionOutline.drawCircle(0, 0, parent.metersToPixles(spaceObject.radius));
        this.selectionSprite.visible = isSelected;
        this.circleBevelSprite.tint = color;
        this.circleBevelSprite.alpha = alpha;
        this.fighterSprite.tint = color;
        this.fighterSprite.alpha = alpha;
    }
}
class DradisAsteroidRenderer implements BlipRenderer<Asteroid> {
    private selectionSprite = blipSprite('dradis_select', this.blipSize, selectionColor);
    private circleBaseSprite = blipSprite('dradis_circleBase', this.blipSize, white);
    private circleBevelSprite = blipSprite('dradis_circleBevel', this.blipSize, white);
    private asteroidSprite = blipSprite('dradis_asteroid', this.blipSize, white);
    private collisionOutline = new Graphics();
    constructor(stage: Container, private blipSize: number) {
        stage.addChild(this.circleBaseSprite);
        stage.addChild(this.circleBevelSprite);
        stage.addChild(this.asteroidSprite);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }
    redraw(spaceObject: Asteroid, { parent, isSelected, color, alpha }: BlipData): void {
        this.collisionOutline.clear();
        this.collisionOutline.lineStyle(1, 0x4ce73c, 0.5);
        this.collisionOutline.drawCircle(0, 0, parent.metersToPixles(spaceObject.radius));
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
    constructor(stage: Container, private blipSize: number) {
        stage.addChild(this.shellCircle);
        stage.addChild(this.selectionSprite);
    }
    redraw(spaceObject: SpaceObject, { parent, isSelected, blipSize, color, alpha }: BlipData): void {
        const radius = Math.max(parent.metersToPixles(spaceObject.radius), 1);
        this.shellCircle.clear();
        this.shellCircle.beginFill(color, alpha);
        this.shellCircle.drawCircle(0, 0, radius);
        this.selectionSprite.visible = isSelected;
        this.selectionSprite.height = blipSize;
        this.selectionSprite.width = blipSize;
    }
}
class TacticalSpaceshipRenderer implements BlipRenderer<Spaceship> {
    private selectionSprite = blipSprite('tactical_select', this.blipSize, selectionColor);
    private fighterSprite = blipSprite('tactical_fighter', this.blipSize, white);
    private text = renderText(this.blipSize / 2, [], white);
    private collisionOutline = new Graphics();

    constructor(stage: Container, private blipSize: number) {
        stage.addChild(this.fighterSprite);
        stage.addChild(this.text);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }

    redraw(spaceObject: Spaceship, { parent, isSelected, blipSize, color, alpha }: BlipData): void {
        this.fighterSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
        this.fighterSprite.tint = color;
        this.fighterSprite.alpha = alpha;
        this.fighterSprite.height = blipSize;
        this.fighterSprite.width = blipSize;
        this.text.text = `ID: ${spaceObject.id}`;
        this.text.x = -this.text.getLocalBounds(new Rectangle()).width / 2;
        this.collisionOutline.clear();
        this.collisionOutline.lineStyle(1, 0x4ce73c, 0.5);
        this.collisionOutline.drawCircle(0, 0, parent.metersToPixles(spaceObject.radius));
        this.selectionSprite.visible = isSelected;
        this.selectionSprite.height = blipSize;
        this.selectionSprite.width = blipSize;
    }
}
class TacticalWaypointRenderer implements BlipRenderer<Waypoint> {
    private selectionSprite = blipSprite('tactical_select', this.blipSize, selectionColor);
    private iconSprite = blipSprite('tactical_waypoint', this.blipSize, white);
    private text = renderText(this.blipSize / 2, [], white);

    constructor(stage: Container, private blipSize: number) {
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
        this.text.text = `${spaceObject.id}`;
        this.text.x = -this.text.getLocalBounds(new Rectangle()).width / 2;
        this.selectionSprite.visible = isSelected;
        this.selectionSprite.height = blipSize;
        this.selectionSprite.width = blipSize;
    }
}
class RadarRangeRenderer implements BlipRenderer<SpaceObject> {
    private range = new Graphics();
    constructor(stage: Container) {
        stage.addChild(this.range);
    }
    redraw(spaceObject: SpaceObject, { parent, color, alpha }: BlipData): void {
        this.range.clear();
        if (spaceObject.radarRange) {
            const radius = parent.metersToPixles(spaceObject.radarRange);
            this.range.beginFill(color, alpha);
            this.range.drawCircle(0, 0, radius);
        }
    }
}

export const dradisDrawFunctions = {
    Spaceship: DradisSpaceshipRenderer,
    Asteroid: DradisAsteroidRenderer,
};

export const tacticalDrawWaypoints = {
    Waypoint: TacticalWaypointRenderer,
};

export const tacticalDrawFunctions = {
    Spaceship: TacticalSpaceshipRenderer,
    Asteroid: CircleRenderer,
    Projectile: CircleRenderer,
    Explosion: CircleRenderer,
};

export const rangeRangeDrawFunctions = {
    Spaceship: RadarRangeRenderer,
};
