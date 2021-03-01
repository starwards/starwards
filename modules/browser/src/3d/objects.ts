import { AbstractMesh, Scene } from '@babylonjs/core';
import { SpaceObject, State, degToRad } from '@starwards/model/src';

import EventEmitter from 'eventemitter3';
import { asteroid } from './asteroid';
import { spaceship } from './spaceship';

export class Objects3D {
    private toReDraw = new Set<ObjectGraphics>();
    constructor(private scene: Scene, private spaceState: State<'space'>, _shipId: string) {
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
                objGraphics.redraw();
            }
        }
        this.toReDraw.clear();
    };

    private onNewSpaceObject(spaceObject: SpaceObject) {
        if (!spaceObject.destroyed) {
            //  && spaceObject.id !== this.shipId
            const objGraphics = new ObjectGraphics(this.scene, spaceObject);
            objGraphics.listen(this.spaceState.events, spaceObject.id, (_field: string) => {
                this.toReDraw.add(objGraphics);
            });
            // this.graphics[spaceObject.id] = objGraphics;
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

    private cleanupSpaceObject(_id: string) {
        // const objGraphics = this.graphics[id];
        // if (objGraphics) {
        //     delete this.graphics[id];
        //     objGraphics.destroy();
        //     this.toReDraw.delete(objGraphics);
        // }
    }
}
/**
 * internal class
 */
// eslint-disable-next-line: max-classes-per-file
class ObjectGraphics {
    private disposables: Array<() => void> = [];
    private destroyed = false;
    private mesh: AbstractMesh | null = null;

    constructor(private scene: Scene, public spaceObject: SpaceObject) {
        void this.loadMesh();
    }

    private async loadMesh() {
        try {
            switch (this.spaceObject.type) {
                case 'Spaceship':
                    this.mesh = await spaceship(this.scene, this.spaceObject.id);
                    break;
                case 'Asteroid':
                    this.mesh = await asteroid(this.scene, this.spaceObject.id, this.spaceObject.radius);
                    break;
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log('error adding 3d obj', e);
        }
        this.redraw();
    }

    isDestroyed() {
        return this.spaceObject.destroyed || this.destroyed;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    redraw() {
        if (this.mesh) {
            this.mesh.position.x = this.spaceObject.position.x;
            this.mesh.position.z = -this.spaceObject.position.y;
            this.mesh.rotation.y = degToRad * this.spaceObject.angle + Math.PI / 2;
        }
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
