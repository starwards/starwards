import { Color4, Scene, SceneLoader, Vector3 } from '@babylonjs/core';

import { Spaceship } from '@starwards/model';

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

    // 3D model "radius" is 1, scale it to fit game model
    importResult.meshes[0].scaling.scaleInPlace(Spaceship.radius);
    const rootMesh = importResult.meshes[0];
    rootMesh.id = `mpid_${id}`;
    rootMesh.name = `Spaceship ${id}`;

    for (const mesh of importResult.meshes) {
        mesh.enableEdgesRendering();
        mesh.edgesWidth = 5.0;
        mesh.edgesColor = new Color4(1, 1, 0, 1);
    }
    // resetting rotationQuaternion to null before updating rotation
    // https://doc.babylonjs.com/divingDeeper/mesh/transforms/center_origin/rotation_quaternions
    rootMesh.rotation = Vector3.Zero();

    return rootMesh;
}
