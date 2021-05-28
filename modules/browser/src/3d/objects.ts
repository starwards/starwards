import { SpaceObject, State, degToRad } from '@starwards/model';

import { AbstractMesh } from '@babylonjs/core';
import { Meshes } from './meshes';

export class Objects3D {
    private graphics = new Map<string, ObjectGraphics>();
    constructor(spaceState: State<'space'>, private meshes: Meshes, _shipId: string) {
        spaceState.events.on('add', (spaceObject: SpaceObject) => this.onNewSpaceObject(spaceObject));
        spaceState.events.on('remove', (spaceObject: SpaceObject) => this.graphics.get(spaceObject.id)?.destroy());

        for (const spaceObject of spaceState) {
            this.onNewSpaceObject(spaceObject);
        }
    }

    public onRender = () => {
        for (const objGraphics of this.graphics.values()) {
            objGraphics.redraw();
        }
    };

    private onNewSpaceObject(spaceObject: SpaceObject) {
        if (!spaceObject.destroyed) {
            let mesh: AbstractMesh;
            try {
                switch (spaceObject.type) {
                    case 'Spaceship':
                        mesh = this.meshes.spaceship(spaceObject.id);
                        break;
                    case 'Asteroid':
                        mesh = this.meshes.asteroid(spaceObject.id, spaceObject.radius);
                        break;
                    case 'CannonShell':
                        mesh = this.meshes.cannonShell(spaceObject.id, spaceObject.radius);
                        break;
                    default:
                        return;
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.log('error adding 3d obj', e);
                return;
            }
            const objGraphics = new ObjectGraphics(spaceObject, mesh, () => this.graphics.delete(spaceObject.id));
            this.graphics.set(spaceObject.id, objGraphics);
        }
    }
}
/**
 * internal class
 */
// eslint-disable-next-line: max-classes-per-file
class ObjectGraphics {
    constructor(public spaceObject: SpaceObject, private mesh: AbstractMesh, private onDestroyed: () => unknown) {}

    redraw() {
        if (this.spaceObject.destroyed) {
            this.destroy();
        } else {
            this.mesh.position.x = this.spaceObject.position.x;
            this.mesh.position.z = -this.spaceObject.position.y;
            this.mesh.rotation.y = degToRad * this.spaceObject.angle + Math.PI / 2;
        }
    }

    destroy() {
        this.onDestroyed();
        this.mesh && this.mesh.dispose();
    }
}
