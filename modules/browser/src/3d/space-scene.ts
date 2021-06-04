import '@babylonjs/core/Loading/loadingScreen';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';
import '@babylonjs/gui';
import '@babylonjs/inspector';
import '@babylonjs/loaders/glTF';

import { Engine, Scene } from '@babylonjs/core';

import { placeLights } from './lights';

// eslint-disable-next-line @typescript-eslint/require-await
export async function placeSceneEnv(engine: Engine, _canvas: HTMLCanvasElement): Promise<Scene> {
    const drawingDistance = 5000;
    const scene = new Scene(engine);

    // universalCamera(scene, canvas);
    // placeAxes(scene, 5);
    // placeSkybox(scene, 'space-engine-2', drawingDistance * 2);
    placeLights(scene, drawingDistance);

    // demo "nebula"
    // https://playground.babylonjs.com/#BHNVUE#2

    return scene;
}
