import { HemisphericLight, Scene, Vector3 } from '@babylonjs/core';
export function placeLights(scene: Scene, drawingDistance: number) {
    const scene2SunPosition = new Vector3(-0.13, 0.87, 0.48).scale(drawingDistance);
    const light = new HemisphericLight('light', scene2SunPosition, scene);

    // Default intensity is 1. Let's dim the light a small amount
    light.intensity = 0.7;
}
