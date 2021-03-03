// https://github.com/RaananW/babylonjs-webpack-es6/tree/master/src
import { Engine } from '@babylonjs/core/Engines/engine';
import { Objects3D } from '../3d/objects';
import { getSpaceDriver } from '../driver';
import { placeSceneEnv } from '../3d/space-scene';

export const babylonInit = async (): Promise<void> => {
    // todo extract to configurable widget

    const urlParams = new URLSearchParams(window.location.search);
    const shipUrlParam = urlParams.get('ship');
    if (shipUrlParam) {
        // const shipRoom = await getShipRoom(shipUrlParam);
        const spaceDriver = await getSpaceDriver();
        // Get the canvas element
        const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
        // Generate the BABYLON 3D engine
        const engine = new Engine(canvas, true);

        // Create the scene
        const scene = await placeSceneEnv(engine, canvas);

        const objects = new Objects3D(scene, spaceDriver.state, shipUrlParam);
        // Register a render loop to repeatedly render the scene
        engine.runRenderLoop(function () {
            objects.onRender();
            scene.render();
        });

        // Watch for browser/canvas resize events
        window.addEventListener('resize', function () {
            engine.resize();
        });
        // scene started rendering, everything is initialized

        await scene.debugLayer.show();

        // eslint-disable-next-line no-console
        console.log('loaded!');
    } else {
        // eslint-disable-next-line no-console
        console.error('missing "ship" url query param');
    }
};

void babylonInit();
