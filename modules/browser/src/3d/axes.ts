import { Color3, DynamicTexture, Mesh, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';

export function placeAxes(scene: Scene, size: number) {
    // show axis
    function makeTextPlane(text: string, color: string | null, size: number) {
        const dynamicTexture = new DynamicTexture('DynamicTexture', 50, scene, true);
        dynamicTexture.hasAlpha = true;
        dynamicTexture.drawText(text, 5, 40, 'bold 36px Arial', color, 'transparent', true);
        const plane = Mesh.CreatePlane('TextPlane', size, scene, true);
        const material = new StandardMaterial('TextPlaneMaterial', scene);
        material.backFaceCulling = false;
        material.specularColor = new Color3(0, 0, 0);
        material.diffuseTexture = dynamicTexture;
        plane.material = material;
        return plane;
    }

    const arrowHeadHeight = size * 0.95;
    const arrowHeadWidth = size * 0.05;
    const charPos = 0.9 * size;
    const axisX = Mesh.CreateLines(
        'axisX',
        [
            Vector3.Zero(),
            new Vector3(size, 0, 0),
            new Vector3(arrowHeadHeight, arrowHeadWidth, 0),
            new Vector3(size, 0, 0),
            new Vector3(arrowHeadHeight, -arrowHeadWidth, 0),
        ],
        scene
    );
    axisX.color = new Color3(1, 0, 0);
    const xChar = makeTextPlane('X', 'red', size / 10);
    xChar.position = new Vector3(charPos, -arrowHeadWidth, 0);
    const axisY = Mesh.CreateLines(
        'axisY',
        [
            Vector3.Zero(),
            new Vector3(0, size, 0),
            new Vector3(-arrowHeadWidth, arrowHeadHeight, 0),
            new Vector3(0, size, 0),
            new Vector3(arrowHeadWidth, arrowHeadHeight, 0),
        ],
        scene
    );
    axisY.color = new Color3(0, 1, 0);
    const yChar = makeTextPlane('Y', 'green', size / 10);
    yChar.position = new Vector3(0, charPos, -arrowHeadWidth);
    const axisZ = Mesh.CreateLines(
        'axisZ',
        [
            Vector3.Zero(),
            new Vector3(0, 0, size),
            new Vector3(0, -arrowHeadWidth, arrowHeadHeight),
            new Vector3(0, 0, size),
            new Vector3(0, arrowHeadWidth, arrowHeadHeight),
        ],
        scene
    );
    axisZ.color = new Color3(0, 0, 1);
    const zChar = makeTextPlane('Z', 'blue', size / 10);
    zChar.position = new Vector3(0, arrowHeadWidth, charPos);
}
