// https://github.com/RaananW/babylonjs-webpack-es6/tree/master/src
import { Engine } from '@babylonjs/core/Engines/engine';
import { loadModelAndEnvScene } from '../3d/scenes/loadModelAndEnv';

export const babylonInit = async (): Promise<void> => {
    // Get the canvas element
    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    // Generate the BABYLON 3D engine
    const engine = new Engine(canvas, true);

    // Create the scene
    const scene = await loadModelAndEnvScene(engine, canvas);

    // Register a render loop to repeatedly render the scene
    engine.runRenderLoop(function () {
        scene.render();
    });

    // Watch for browser/canvas resize events
    window.addEventListener('resize', function () {
        engine.resize();
    });
    // scene started rendering, everything is initialized

    // eslint-disable-next-line no-console
    console.log('loaded!');
};

void babylonInit();
