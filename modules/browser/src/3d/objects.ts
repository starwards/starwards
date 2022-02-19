import { SpaceObject, State, degToRad } from '@starwards/model';
import { TransformNode, Vector3 } from '@babylonjs/core';

import { Meshes } from './meshes';

export class Objects3D {
    private graphics = new Map<string, ObjectGraphics>();
    constructor(spaceState: State<'space'>, private meshes: Meshes, private shipId: string) {
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
            try {
                if (spaceObject.id === this.shipId) {
                    const skybox = this.makeGraphics('skybox', spaceObject, this.meshes.skybox());
                    skybox.trackRotation = false;
                    this.makeGraphics(spaceObject.id, spaceObject, this.meshes.pov(spaceObject.id));
                } else {
                    let mesh: TransformNode | null = null;
                    switch (spaceObject.type) {
                        case 'Spaceship':
                            {
                                mesh = this.meshes.spaceship(spaceObject.id);
                                // todo: per thruster
                                // TODO: add parameters & wiring
                                // const thruster = this.meshes.thruster({ x: -21, y: -0.38, z: -28 });
                                // thruster.parent = mesh;
                            }
                            break;
                        case 'Asteroid':
                            mesh = this.meshes.asteroid(spaceObject.id, spaceObject.radius);
                            break;
                        case 'CannonShell':
                            mesh = this.meshes.cannonShell(spaceObject.id, spaceObject.radius);
                            break;
                    }
                    if (mesh) {
                        this.makeGraphics(spaceObject.id, spaceObject, mesh);
                    }
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.log('error adding 3d obj', e);
                return;
            }
        }
    }

    private makeGraphics(id: string, spaceObject: SpaceObject, mesh: Mesh) {
        const objGraphics = new ObjectGraphics(spaceObject, mesh, () => this.graphics.delete(id));
        this.graphics.set(id, objGraphics);
        return objGraphics;
    }
}
type Mesh = {
    position: Vector3;
    rotation: Vector3;
    dispose: () => unknown;
};
/**
 * internal class
 */
// eslint-disable-next-line: max-classes-per-file
class ObjectGraphics {
    public trackRotation = true;
    constructor(public spaceObject: SpaceObject, private mesh: Mesh, private onDestroyed: () => unknown) {}

    redraw() {
        if (this.spaceObject.destroyed) {
            this.destroy();
        } else {
            this.mesh.position.x = this.spaceObject.position.x;
            this.mesh.position.z = -this.spaceObject.position.y;
            if (this.trackRotation) {
                this.mesh.rotation.y = degToRad * this.spaceObject.angle + Math.PI / 2;
            }
        }
    }

    destroy() {
        this.onDestroyed();
        this.mesh?.dispose();
    }
}
