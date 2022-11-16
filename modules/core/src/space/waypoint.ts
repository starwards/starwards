import { MapSchema, Schema, type } from '@colyseus/schema';

import { Vec2 } from './vec2';

export class Waypoint extends Schema {
    @type('string')
    public key = '';
    @type(Vec2)
    public position: Vec2 = new Vec2(0, 0);
}

export class WaypointsSet extends Schema {
    @type('uint32')
    public color = 0xffffff;

    @type({ map: Waypoint })
    waypoints = new MapSchema<Waypoint>();
}
