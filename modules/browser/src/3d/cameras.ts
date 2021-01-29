import { ArcRotateCamera, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';

export function debugCamera(scene: Scene, canvas: HTMLCanvasElement) {
    const camera = new ArcRotateCamera('debuggingCamera', 0, Math.PI / 3, 10, new Vector3(0, 0, 0), scene);

    // This targets the camera to scene origin
    camera.setTarget(Vector3.Zero());

    // This attaches the camera to the canvas
    camera.attachControl(canvas, true);
    window.$cam = camera;
}

export function universalCamera(scene: Scene, canvas: HTMLCanvasElement) {
    const camera = new UniversalCamera('main camera', Vector3.Zero(), scene);

    // This targets the camera to scene origin
    camera.setTarget(new Vector3(0, 0, 1));

    // This attaches the camera to the canvas
    camera.attachControl(canvas, true);
}
