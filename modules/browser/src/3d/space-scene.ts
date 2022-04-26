import '@babylonjs/core/Loading/loadingScreen';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';
import '@babylonjs/gui';
import '@babylonjs/inspector';
import '@babylonjs/loaders/glTF';

import { Engine, Scene } from '@babylonjs/core';

import { placeLights } from './lights';

export function placeSceneEnv(engine: Engine) {
    const drawingDistance = 5000;
    const scene = new Scene(engine);

    placeLights(scene, drawingDistance);

    // demo "nebula"
    // https://playground.babylonjs.com/#BHNVUE#2

    return scene;
}
