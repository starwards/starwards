import { nosync } from 'colyseus';

export class Entity {

    public static distance(a: Entity, b: Entity) {
        return Math.sqrt(Math.pow(a.y - b.y, 2) + Math.pow(a.x - b.x, 2));
    }
    public x: number;
    public y: number;
    public radius: number;

    @nosync public dead: boolean = false;
    @nosync public angle: number = 0;
    @nosync public speed = 0;

    constructor(x: number, y: number, radius: number) {
        this.x = x;
        this.y = y;
        this.radius = radius;
    }
}
