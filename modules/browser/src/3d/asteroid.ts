import { Scene, SceneLoader } from '@babylonjs/core';

import { initMesh } from './asset-utils';

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
    initMesh(rootMesh, id, 'Asteroid', radius);

    return rootMesh;
}
