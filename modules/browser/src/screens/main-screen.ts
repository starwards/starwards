import { Driver } from '@starwards/model';
// https://github.com/RaananW/babylonjs-webpack-es6/tree/master/src
import { Engine } from '@babylonjs/core';
import { Objects3D } from '../3d/objects';
import { loadMeshes } from '../3d/meshes';
import { placeSceneEnv } from '../3d/space-scene';
import { wireSinglePilotInput } from '../input/wiring';

const driver = new Driver(window.location);

const NUM_OF_FRAMES_FOR_LOADED = 1;
export const babylonInit = async (): Promise<void> => {
    // todo extract to configurable widget

    const urlParams = new URLSearchParams(window.location.search);
    const shipId = urlParams.get('ship');
    const debug = urlParams.has('debug');
    if (shipId) {
        const shipDriver = await driver.getShipDriver(shipId);
        const spaceDriver = await driver.getSpaceDriver();
        // Get the canvas element
        const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
        canvas.setAttribute('data-loaded', `false`);
        // Generate the BABYLON 3D engine
        const engine = new Engine(canvas, true);

        // Create the scene
        const scene = placeSceneEnv(engine);
        const meshes = await loadMeshes(scene);
        const objects = new Objects3D(spaceDriver, meshes, shipId);
        // Register a render loop to repeatedly render the scene
        let frameNum = 0;
        engine.runRenderLoop(function () {
            objects.onRender();
            scene.render();
            if (scene.isReady() && frameNum <= NUM_OF_FRAMES_FOR_LOADED) {
                frameNum++;
            }
            if (frameNum === NUM_OF_FRAMES_FOR_LOADED) {
                canvas.setAttribute('data-loaded', `true`);
            }
        });

        // Watch for browser/canvas resize events
        window.addEventListener('resize', function () {
            engine.resize();
        });
        // scene started rendering, everything is initialized
        if (debug) {
            wireSinglePilotInput(shipDriver);
            await scene.debugLayer.show();
            // eslint-disable-next-line no-console
            console.log('loaded!');
        }
    } else {
        // eslint-disable-next-line no-console
        console.error('missing "ship" url query param');
    }
};

void babylonInit();
