import '@babylonjs/core/Loading/loadingScreen';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';
import '@babylonjs/loaders/glTF';

import { Engine, Scene } from '@babylonjs/core';

import { debugCamera } from '../cameras';
import { placeAxes } from '../axes';
import { placeLights } from '../lights';
import { placeSkybox } from '../skybox';
import { spaceship } from '../spaceship';

// eslint-disable-next-line @typescript-eslint/require-await
export async function loadModelAndEnvScene(engine: Engine, canvas: HTMLCanvasElement): Promise<Scene> {
    const drawingDistance = 750;
    const scene = new Scene(engine);

    // universalCamera(scene, canvas);
    debugCamera(scene, canvas);
    placeAxes(scene, 5);
    placeSkybox(scene, 'space2', drawingDistance * 2);
    placeLights(scene, drawingDistance);

    // demo "nebula"
    // https://playground.babylonjs.com/#BHNVUE#2

    await spaceship(scene);
    return scene;
}
