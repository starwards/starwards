import { Circle, System } from 'detect-collisions';
import { Faction, SpaceObject, XY } from '@starwards/model';

import { SpaceDriver } from '../../driver';
import { TrackObjects } from './track-objects';

export class RadarRangeFilter {
    public collisions = new System(1);

    private createRange = (o: SpaceObject) => this.collisions.createCircle(XY.clone(o.position), o.radarRange);
    private updateRange = (o: SpaceObject, r: Circle) => {
        r.r = o.radarRange; // order matters!
        r.setPosition(o.position.x, o.position.y); // this call implicitly updates the collision body
    };
    private destroyRange = (r: Circle) => this.collisions.remove(r);
    private shouldTrack = (o: SpaceObject) => o.faction === this.faction;
    public radarRanges = new TrackObjects<Circle>(
        this.spaceDriver,
        this.createRange,
        this.updateRange,
        this.destroyRange,
        this.shouldTrack
    );
    constructor(private spaceDriver: SpaceDriver, private faction: Faction) {}

    public update = () => {
        this.radarRanges.update();
    };

    public isInRange = (obj: SpaceObject) => {
        const testBody = new Circle({ x: obj.position.x, y: obj.position.y }, obj.radius);
        for (const potential of this.collisions.getPotentials(testBody)) {
            if (this.collisions.checkCollision(testBody, potential)) {
                return true;
            }
        }
        return false;
    };
}
