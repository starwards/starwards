import { Scene, SceneLoader } from '@babylonjs/core';
export async function spaceship(scene: Scene) {
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
    return importResult;
}
