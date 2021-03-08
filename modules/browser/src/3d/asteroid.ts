import { Scene, SceneLoader } from '@babylonjs/core';

import { initMesh } from './asset-utils';

export async function asteroid(scene: Scene, id: string, radius: number) {
    // import model
    // TODO use LoadAssetContainerAsync
    const importResult = await SceneLoader.ImportMeshAsync(
        '',
        'models/Asteroid_01/Asteroid_01.gltf',
        '',
        scene,
        undefined,
        '.gltf'
    );

    const rootMesh = importResult.meshes[0];
    initMesh(rootMesh, id, 'Asteroid', radius);

    return rootMesh;
}
