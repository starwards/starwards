import { AbstractMesh, AssetContainer, InstantiatedEntries, Mesh, Scene, SceneLoader, Vector3 } from '@babylonjs/core';

import { Spaceship } from '@starwards/model';

function initMesh(mesh: AbstractMesh, id: string, radius: number) {
    mesh.id = `mpid_${id}`;

    mesh.normalizeToUnitCube(true);
    mesh.scaling.scaleInPlace(radius * 2);

    // resetting rotationQuaternion to null before updating rotation
    // https://doc.babylonjs.com/divingDeeper/mesh/transforms/center_origin/rotation_quaternions
    mesh.rotation = Vector3.Zero();
}

function isMesh(a: unknown): a is Mesh {
    return !!(a && (a as Mesh)._isMesh);
}
function getMesh(entries: InstantiatedEntries): AbstractMesh {
    const a = entries.rootNodes[0];
    if (isMesh(a)) {
        return a;
    } else {
        throw new Error(`unexpected node that is not a mesh`);
        //return a.getChildMeshes(true)[0];
    }
}
export async function loadMeshes(scene: Scene) {
    const [spaceship, asteroid, cannonShell] = await Promise.all([
        SceneLoader.LoadAssetContainerAsync('models/spaceship_nortend/scene.gltf', '', scene, undefined, '.gltf'),
        SceneLoader.LoadAssetContainerAsync('models/Asteroid_01/Asteroid_01.gltf', '', scene, undefined, '.gltf'),
        SceneLoader.LoadAssetContainerAsync('models/Projectile_03/test.gltf', '', scene, undefined, '.gltf'),
    ]);
    return new Meshes(spaceship, asteroid, cannonShell);
}
export class Meshes {
    constructor(
        private spaceshipCont: AssetContainer,
        private asteroidCont: AssetContainer,
        private cannonShellCont: AssetContainer
    ) {}
    spaceship(id: string) {
        const entries = this.spaceshipCont.instantiateModelsToScene((name) => `Spaceship ${id} ${name}`);
        const rootMesh = getMesh(entries);
        initMesh(rootMesh, id, Spaceship.radius);
        return rootMesh;
    }
    asteroid(id: string, radius: number) {
        const entries = this.asteroidCont.instantiateModelsToScene((name) => `Asteroid ${id} ${name}`);
        const rootMesh = getMesh(entries);
        initMesh(rootMesh, id, radius);
        return rootMesh;
    }
    cannonShell(id: string, radius: number) {
        const entries = this.cannonShellCont.instantiateModelsToScene((name) => `CannonShell ${id} ${name}`);
        const rootMesh = getMesh(entries);
        initMesh(rootMesh, id, radius * 100);
        return rootMesh;
    }
}
