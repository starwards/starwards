import { Scene, SceneLoader } from '@babylonjs/core';

import { Spaceship } from '@starwards/model';
import { initMesh } from './asset-utils';

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

    const rootMesh = importResult.meshes[0];
    initMesh(rootMesh, id, 'Spaceship', Spaceship.radius);

    return rootMesh;
}
