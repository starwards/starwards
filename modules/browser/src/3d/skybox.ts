import { Color3, CubeTexture, MeshBuilder, Scene, StandardMaterial, Texture } from '@babylonjs/core';

export function placeSkybox(scene: Scene, name: string, size: number) {
    /* files order: [
       "_px.jpg", // right.png
       "_py.jpg", // top.png
       "_pz.jpg", // front.png
       "_nx.jpg", // left.png
       "_ny.jpg", // bottom.png
       "_nz.jpg" // back.png
    ]; */
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

    const skybox = MeshBuilder.CreateBox('skyBox', { size }, scene);
    const skyboxMaterial = new StandardMaterial('skyBox', scene);
    skyboxMaterial.backFaceCulling = false;
    skyboxMaterial.reflectionTexture = skyboxTexture;
    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);
    skybox.material = skyboxMaterial;
    return skybox;
}
