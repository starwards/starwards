import { Axis, InstancedMesh, Mesh, Scene, SceneLoader, Space } from '@babylonjs/core';
export async function spaceship(scene: Scene, id: string) {
    // import spaceship model
    const importResult = await SceneLoader.ImportMeshAsync(
        '',
        'models/spaceship_nortend/scene.gltf',
        '',
        scene,
        undefined,
        '.gltf'
    );

    // // just scale it so we can see it better
    // importResult.meshes[0].scaling.scaleInPlace(1);
    const rootMesh = importResult.meshes[0];
    rootMesh.id = `mpid_${id}`;
    rootMesh.name = `Spaceship ${id}`;
    rootMesh.rotate(Axis.Y, -Math.PI / 2, Space.LOCAL);

    // if (rootMesh instanceof Mesh) {
    //     rootMesh.rotation.y = 270;
    //     rootMesh.bakeCurrentTransformIntoVertices(false);
    // }
    return rootMesh;
}
