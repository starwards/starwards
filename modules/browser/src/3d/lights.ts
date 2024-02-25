import { Color3, HemisphericLight, Matrix, MeshBuilder, PointLight, Scene, Vector3 } from '@babylonjs/core';
export function placeLights(scene: Scene, drawingDistance: number) {
    const scene2SunPosition = new Vector3(0.968, -0.05, 0.25).scale(drawingDistance);
    const sunLight = new PointLight('light', scene2SunPosition, scene);
    sunLight.name = 'sunLight';
    sunLight.diffuse = new Color3(1, 1, 1);
    sunLight.specular = new Color3(1, 1, 0.6);
    sunLight.intensity = 1000000000;

    const sunSphere = MeshBuilder.CreateSphere('sunSphere', {}, scene);
    sunSphere.position = scene2SunPosition;

    const coldAmbiencePosition = Vector3.TransformCoordinates(
        scene2SunPosition,
        Matrix.RotationAxis(new Vector3(0, 1, 0.2), Math.PI / 2),
    );

    // use https://playground.babylonjs.com/#20OAV9 to balance lights
    const coldAmbience = new HemisphericLight('light', coldAmbiencePosition, scene);
    coldAmbience.name = 'coldAmbience';
    coldAmbience.diffuse = new Color3(0.25, 0.47, 0.69);
    coldAmbience.specular = new Color3(0.09, 0, 0.23);
    coldAmbience.intensity = 1.5;

    const warmAmbience = new HemisphericLight('light', scene2SunPosition.negate(), scene);
    warmAmbience.name = 'warmAmbience';
    warmAmbience.diffuse = new Color3(0.71, 0.42, 0);
    warmAmbience.specular = new Color3(0.92, 0.85, 0.2);
    warmAmbience.intensity = 1;
}
