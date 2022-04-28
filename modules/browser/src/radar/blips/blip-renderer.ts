import { Asteroid, SpaceObject, Spaceship } from '@starwards/model';
import { Graphics, Loader, Rectangle, Sprite, Text, TextStyle } from 'pixi.js';
import { ObjectGraphics, SpaceObjectRenderer } from './object-graphics';
import { selectionColor, white } from '../../colors';

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
    tactical_select: 'images/tactical_radar/selection.png',
};

Loader.shared.add(Object.values(textures));

function blipSprite(t: keyof typeof textures, size: number, color: number) {
    const texturePath = textures[t];
    const radarBlipTexture = Loader.shared.resources[texturePath].texture;
    const radarBlipSprite = new Sprite(radarBlipTexture);
    radarBlipSprite.tint = color;
    radarBlipSprite.height = size;
    radarBlipSprite.width = size;
    radarBlipSprite.anchor.set(0.5);
    return radarBlipSprite;
}

class DradisSpaceshipRenderer implements SpaceObjectRenderer {
    private selectionSprite = blipSprite('dradis_select', this.data.blipSize, selectionColor);
    private directionSprite = blipSprite('dradis_direction', this.data.blipSize, white);
    private circleBaseSprite = blipSprite('dradis_circleBase', this.data.blipSize, white);
    private circleBevelSprite = blipSprite('dradis_circleBevel', this.data.blipSize, white);
    private fighterSprite = blipSprite('dradis_fighter', this.data.blipSize, white);
    private text = renderText(this.data.blipSize / 2, [], white);
    private collisionOutline = new Graphics();

    constructor(private data: ObjectGraphics<Spaceship>) {
        const { stage } = this.data;
        stage.addChild(this.directionSprite);
        stage.addChild(this.circleBaseSprite);
        stage.addChild(this.circleBevelSprite);
        stage.addChild(this.fighterSprite);
        stage.addChild(this.text);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }

    redraw(): void {
        const { parent, spaceObject, isSelected, color } = this.data;
        this.directionSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
        this.text.text = `ID: ${spaceObject.id}`;
        this.text.x = -this.text.getLocalBounds(new Rectangle()).width / 2;
        this.collisionOutline.clear();
        this.collisionOutline.lineStyle(1, 0x4ce73c, 0.5);
        this.collisionOutline.drawCircle(0, 0, parent.metersToPixles(spaceObject.radius));
        this.selectionSprite.visible = isSelected;
        this.circleBevelSprite.tint = color;
        this.fighterSprite.tint = color;
    }
}
class DradisAsteroidRenderer implements SpaceObjectRenderer {
    private selectionSprite = blipSprite('dradis_select', this.data.blipSize, selectionColor);
    private circleBaseSprite = blipSprite('dradis_circleBase', this.data.blipSize, white);
    private circleBevelSprite = blipSprite('dradis_circleBevel', this.data.blipSize, white);
    private asteroidSprite = blipSprite('dradis_asteroid', this.data.blipSize, white);
    private collisionOutline = new Graphics();
    constructor(private data: ObjectGraphics<Asteroid>) {
        const { stage } = this.data;
        stage.addChild(this.circleBaseSprite);
        stage.addChild(this.circleBevelSprite);
        stage.addChild(this.asteroidSprite);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }
    redraw(): void {
        const { parent, spaceObject, isSelected, color } = this.data;
        this.collisionOutline.clear();
        this.collisionOutline.lineStyle(1, 0x4ce73c, 0.5);
        this.collisionOutline.drawCircle(0, 0, parent.metersToPixles(spaceObject.radius));
        this.selectionSprite.visible = isSelected;
        this.circleBevelSprite.tint = color;
        this.asteroidSprite.tint = color;
    }
}

class CircleRenderer implements SpaceObjectRenderer {
    private shellCircle = new Graphics();
    private selectionSprite = blipSprite('tactical_select', this.data.blipSize, selectionColor);
    constructor(private data: ObjectGraphics<SpaceObject>) {
        const { stage } = this.data;
        stage.addChild(this.shellCircle);
        stage.addChild(this.selectionSprite);
    }
    redraw(): void {
        const { parent, spaceObject, isSelected, blipSize, color } = this.data;
        const radius = Math.max(parent.metersToPixles(spaceObject.radius), 1);
        this.shellCircle.clear();
        this.shellCircle.beginFill(color);
        this.shellCircle.drawCircle(0, 0, radius);
        this.selectionSprite.visible = isSelected;
        this.selectionSprite.height = blipSize;
        this.selectionSprite.width = blipSize;
    }
}
class TacticalSpaceshipRenderer implements SpaceObjectRenderer {
    private selectionSprite = blipSprite('tactical_select', this.data.blipSize, selectionColor);
    private fighterSprite = blipSprite('tactical_fighter', this.data.blipSize, white);
    private text = renderText(this.data.blipSize / 2, [], white);
    private collisionOutline = new Graphics();

    constructor(private data: ObjectGraphics<Spaceship>) {
        const { stage } = this.data;
        stage.addChild(this.fighterSprite);
        stage.addChild(this.text);
        stage.addChild(this.collisionOutline);
        stage.addChild(this.selectionSprite);
    }

    redraw(): void {
        const { parent, spaceObject, isSelected, blipSize, color } = this.data;
        this.fighterSprite.angle = (spaceObject.angle - parent.camera.angle) % 360;
        this.fighterSprite.tint = color;
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

class RadarRangeRenderer implements SpaceObjectRenderer {
    private range = new Graphics();
    constructor(private data: ObjectGraphics<SpaceObject>) {
        const { stage } = this.data;
        stage.addChild(this.range);
    }
    redraw(): void {
        const { parent, spaceObject, color } = this.data;
        this.range.clear();
        if (spaceObject.radarRange) {
            const radius = parent.metersToPixles(spaceObject.radarRange);
            this.range.beginFill(color, 0.1);
            this.range.drawCircle(0, 0, radius);
        }
    }
}

export const dradisDrawFunctions = {
    Spaceship: DradisSpaceshipRenderer,
    Asteroid: DradisAsteroidRenderer,
};

export const tacticalDrawFunctions = {
    Spaceship: TacticalSpaceshipRenderer,
    Asteroid: CircleRenderer,
    CannonShell: CircleRenderer,
    Explosion: CircleRenderer,
};

export const rangeRangeDrawFunctions = {
    Spaceship: RadarRangeRenderer,
};
