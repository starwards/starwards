import '@babylonjs/core/Loading/loadingScreen';
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';

import {
    ArcRotateCamera,
    Color3,
    CubeTexture,
    Engine,
    HemisphericLight,
    MeshBuilder,
    Scene,
    SceneLoader,
    StandardMaterial,
    Texture,
    Vector3,
} from '@babylonjs/core';

export async function loadModelAndEnvScene(engine: Engine, canvas: HTMLCanvasElement): Promise<Scene> {
    // This creates a basic Babylon Scene object (non-mesh)
    const scene = new Scene(engine);

    // This creates and positions a free camera (non-mesh)
    const camera = new ArcRotateCamera('my first camera', 0, Math.PI / 3, 10, new Vector3(0, 0, 0), scene);

    // This targets the camera to scene origin
    camera.setTarget(Vector3.Zero());

    // This attaches the camera to the canvas
    camera.attachControl(canvas, true);

    camera.useFramingBehavior = true;

    // load the environment file
    const name = 'space2';
    const skyboxTexture = CubeTexture.CreateFromImages(
        [
            `environment/${name}/right.png`,
            `environment/${name}/top.png`,
            `environment/${name}/front.png`,
            `environment/${name}/left.png`,
            `environment/${name}/bottom.png`,
            `environment/${name}/back.png`,
        ],
        scene
    );

    const skybox = MeshBuilder.CreateBox('skyBox', { size: 1500 }, scene);
    const skyboxMaterial = new StandardMaterial('skyBox', scene);
    skyboxMaterial.backFaceCulling = false;
    skyboxMaterial.reflectionTexture = skyboxTexture;
    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);
    skybox.material = skyboxMaterial;

    // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene);

    // Default intensity is 1. Let's dim the light a small amount
    light.intensity = 0.7;

    // demo "nebula"
    // https://playground.babylonjs.com/#BHNVUE#2

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
    importResult.meshes[0].scaling.scaleInPlace(10);

    return scene;
}
