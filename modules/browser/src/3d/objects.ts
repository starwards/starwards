import { SpaceObject, State, degToRad } from '@starwards/model';

import { AbstractMesh } from '@babylonjs/core';
import EventEmitter from 'eventemitter3';
import { Meshes } from './meshes';

export class Objects3D {
    private graphics: { [id: string]: ObjectGraphics } = {};
    private toReDraw = new Set<ObjectGraphics>();
    constructor(private spaceState: State<'space'>, private meshes: Meshes, _shipId: string) {
        spaceState.events.on('add', (spaceObject: SpaceObject) => this.onNewSpaceObject(spaceObject));
        spaceState.events.on('remove', (spaceObject: SpaceObject) => this.cleanupSpaceObject(spaceObject.id));

        for (const spaceObject of spaceState) {
            this.onNewSpaceObject(spaceObject);
        }
    }

    public onRender = () => {
        for (const objGraphics of this.toReDraw) {
            if (objGraphics.isDestroyed()) {
                this.cleanupSpaceObject(objGraphics.spaceObject.id);
            } else {
                if (!this.spaceState.get(objGraphics.spaceObject.id)) {
                    // eslint-disable-next-line no-console
                    console.warn(`found zombie object! ${objGraphics.spaceObject.id}`);
                }
                objGraphics.redraw();
            }
        }
        // this.toReDraw.clear();
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
            //  && spaceObject.id !== this.shipId
            const objGraphics = new ObjectGraphics(spaceObject, mesh);
            this.toReDraw.add(objGraphics);

            // objGraphics.listen(this.spaceState.events, spaceObject.id, (_field: string) => {
            //     this.toReDraw.add(objGraphics);
            // });
            this.graphics[spaceObject.id] = objGraphics;
            // this.stage.addChild(objGraphics.stage);
            // objGraphics.listen(this.parent.events as EventEmitter, 'screenChanged', () => {
            //     objGraphics.markChanged('screen');
            //     this.toReDraw.add(objGraphics);
            // });
            // objGraphics.listen(this.parent.events as EventEmitter, 'angleChanged', () => {
            //     objGraphics.markChanged('parentAngle');
            //     this.toReDraw.add(objGraphics);
            // });
            // objGraphics.listen(this.room.state.events, spaceObject.id, (field: string) => {
            //     objGraphics.markChanged(field);
            //     this.toReDraw.add(objGraphics);
            // });
            // objGraphics.listen(this.selectedItems.events, spaceObject.id, () => {
            //     objGraphics.markChanged('selected');
            //     this.toReDraw.add(objGraphics);
            // });
        }
    }

    private cleanupSpaceObject(id: string) {
        const objGraphics = this.graphics[id];
        if (objGraphics) {
            delete this.graphics[id];
            objGraphics.destroy();
            this.toReDraw.delete(objGraphics);
        }
    }
}
/**
 * internal class
 */
// eslint-disable-next-line: max-classes-per-file
class ObjectGraphics {
    private disposables: Array<() => void> = [];
    private destroyed = false;
    // private mesh: AbstractMesh | null = null;

    constructor(public spaceObject: SpaceObject, private mesh: AbstractMesh) {}

    isDestroyed() {
        return this.spaceObject.destroyed || this.destroyed;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    redraw() {
        // if (this.mesh) {
        this.mesh.position.x = this.spaceObject.position.x;
        this.mesh.position.z = -this.spaceObject.position.y;
        this.mesh.rotation.y = degToRad * this.spaceObject.angle + Math.PI / 2;
        // }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen(events: EventEmitter, event: string, listener: (...args: any[]) => any) {
        if (!this.isDestroyed()) {
            events.on(event, listener);
            this.disposables.push(() => events.off(event, listener));
        }
    }

    destroy() {
        if (!this.destroyed) {
            this.mesh && this.mesh.dispose();
            for (const d of this.disposables) {
                d();
            }
            this.destroyed = true;
        }
    }
}
