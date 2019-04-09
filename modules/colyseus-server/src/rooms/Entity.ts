import { nosync } from 'colyseus';
import { Schema, type } from '@colyseus/schema';

export class Entity extends Schema {

    public static distance(a: Entity, b: Entity) {
        return Math.sqrt(Math.pow(a.y - b.y, 2) + Math.pow(a.x - b.x, 2));
    }
    @type('int16')
    public x: number;
    @type('int16')
    public y: number;
    @type('int16')
    public radius: number;

    @nosync public dead: boolean = false;
    @nosync public angle: number = 0;
    @nosync public speed = 0;

    constructor(x: number, y: number, radius: number) {
        super();
        this.x = x;
        this.y = y;
        this.radius = radius;
    }
}
