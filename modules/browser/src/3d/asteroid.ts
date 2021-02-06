import { Scene, SceneLoader, Vector3 } from '@babylonjs/core';
export async function asteroid(scene: Scene, id: string, radius: number) {
    // import model
    // TODO use LoadAssetContainerAsync
    const importResult = await SceneLoader.ImportMeshAsync(
        '',
        'models/meteor_01/Meteor_01.babylon',
        '',
        scene,
        undefined,
        '.babylon'
    );

    const rootMesh = importResult.meshes[0];
    rootMesh.id = `mpid_${id}`;
    rootMesh.name = `Asteroid ${id}`;
    // 3D model "radius" is 1, scale it to fit game model
    importResult.meshes[0].scaling.scaleInPlace(radius);

    // resetting rotationQuaternion to null before updating rotation
    // https://doc.babylonjs.com/divingDeeper/mesh/transforms/center_origin/rotation_quaternions
    rootMesh.rotation = Vector3.Zero();

    return rootMesh;
}
