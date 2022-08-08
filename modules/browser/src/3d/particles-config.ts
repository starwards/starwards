import { AbstractMesh, Color4, ParticleSystem, Scene, Texture, Vector3 } from '@babylonjs/core';

import { XYZ } from '@starwards/core';

type ParticleConfig = {
    blendMode: number;
    capacity: number;
    color1: [number, number, number];
    color2: [number, number, number];
    colorDead: [number, number, number];
    deadAlpha: number;
    direction1: [number, number, number];
    direction2: [number, number, number];
    emitRate: number;
    maxAngularSpeed: number;
    maxEmitBox: [number, number, number];
    maxEmitPower: number;
    maxLifeTime: number;
    maxSize: number;
    minAngularSpeed: number;
    minEmitBox: [number, number, number];
    minEmitPower: number;
    minLifeTime: number;
    minSize: number;
    targetStopFrame: number;
    textureMask: [number, number, number, number];
    textureName: string;
    updateSpeed: number;
};
function makeParticlesSystem(
    name: string,
    scene: Scene,
    emitter: AbstractMesh,
    config: ParticleConfig,
    direction: XYZ
) {
    const myParticleSystem = new ParticleSystem(name, config.capacity, scene);
    myParticleSystem.particleTexture = new Texture(`particles/${config.textureName}`, scene);
    myParticleSystem.color1 = new Color4(...config.color1);
    myParticleSystem.color2 = new Color4(...config.color2);
    myParticleSystem.colorDead = new Color4(...config.colorDead, config.deadAlpha);
    myParticleSystem.direction1 = new Vector3(...config.direction1);
    myParticleSystem.direction2 = new Vector3(...config.direction2);
    myParticleSystem.emitRate = config.emitRate;
    myParticleSystem.maxEmitBox = new Vector3(direction.x, direction.y, direction.z);
    myParticleSystem.minEmitBox = new Vector3(direction.x, direction.y, direction.z);
    myParticleSystem.maxEmitPower = config.maxEmitPower;
    myParticleSystem.minEmitPower = config.minEmitPower;
    myParticleSystem.maxLifeTime = config.maxLifeTime;
    myParticleSystem.minLifeTime = config.minLifeTime;
    myParticleSystem.maxSize = config.maxSize;
    myParticleSystem.minSize = config.minSize;
    myParticleSystem.textureMask = new Color4(...config.textureMask);
    myParticleSystem.updateSpeed = config.updateSpeed;
    myParticleSystem.emitter = emitter;
    myParticleSystem.start();
    return myParticleSystem;
}
// const _old_configs: ParticleConfig[] = [
//     {
//         blendMode: 0,
//         capacity: 200,
//         color1: [0.286274523, 0.619607866, 1],
//         color2: [0.819607854, 0.239215687, 1],
//         colorDead: [0, 0, 0],
//         deadAlpha: 0,
//         direction1: [1, 0, 0],
//         direction2: [1, 0, 0],
//         emitRate: 10,
//         maxAngularSpeed: 0,
//         maxEmitBox: [8.932639, 5.346677, 7.983664],
//         maxEmitPower: 4,
//         maxLifeTime: 30.69073,
//         maxSize: 8,
//         minAngularSpeed: 0,
//         minEmitBox: [-8.71489, -3.47, -7.99741],
//         minEmitPower: 1,
//         minLifeTime: 0,
//         minSize: 1.395973,
//         targetStopFrame: 0,
//         textureMask: [1, 1, 1, 0],
//         textureName: 'Part.jpg',
//         updateSpeed: 0.4,
//     },
//     {
//         blendMode: 0,
//         capacity: 30,
//         color1: [0.286274523, 0.619607866, 1],
//         color2: [0.819607854, 0.239215687, 1],
//         colorDead: [0, 0, 0],
//         deadAlpha: 0,
//         direction1: [1, 0, 0],
//         direction2: [1, 0, 0],
//         emitRate: 2,
//         maxAngularSpeed: 0,
//         maxEmitBox: [1.278619, 0.7926775, 0],
//         maxEmitPower: 4,
//         maxLifeTime: 30.69073,
//         maxSize: 8,
//         minAngularSpeed: 0,
//         minEmitBox: [-1.25921, -0.5, 0],
//         minEmitPower: 1,
//         minLifeTime: 0,
//         minSize: 1.395973,
//         targetStopFrame: 0,
//         textureMask: [1, 1, 1, 0],
//         textureName: 'Part.jpg',
//         updateSpeed: 0.8,
//     },
//     {
//         blendMode: 0,
//         capacity: 30,
//         color1: [0.286274523, 0.619607866, 1],
//         color2: [0.819607854, 0.239215687, 1],
//         colorDead: [0, 0, 0],
//         deadAlpha: 0,
//         direction1: [1, 0, 0],
//         direction2: [1, 0, 0],
//         emitRate: 2,
//         maxAngularSpeed: 0,
//         maxEmitBox: [1.278619, 0.7926775, 0],
//         maxEmitPower: 4,
//         maxLifeTime: 30.69073,
//         maxSize: 8,
//         minAngularSpeed: 0,
//         minEmitBox: [-1.25921, -0.5, 0],
//         minEmitPower: 1,
//         minLifeTime: 0,
//         minSize: 1.395973,
//         targetStopFrame: 0,
//         textureMask: [1, 1, 1, 0],
//         textureName: 'Part.jpg',
//         updateSpeed: 0.8,
//     },
//     {
//         blendMode: 0,
//         capacity: 1,
//         color1: [0.9019608, 1, 0.168627456],
//         color2: [0.768627465, 1, 0.1882353],
//         colorDead: [0.6666667, 1, 0],
//         deadAlpha: 0,
//         direction1: [1, 0, 0],
//         direction2: [1, 0, 0],
//         emitRate: 1,
//         maxAngularSpeed: 0,
//         maxEmitBox: [1.278619, 0.7926775, 0],
//         maxEmitPower: 3.507097,
//         maxLifeTime: 114.1318,
//         maxSize: 57.63959,
//         minAngularSpeed: 0,
//         minEmitBox: [-1.25921, -0.5, 0],
//         minEmitPower: 3.507097,
//         minLifeTime: 114.1318,
//         minSize: 57.63959,
//         targetStopFrame: 0,
//         textureMask: [1, 1, 1, 0],
//         textureName: 'Laser1.jpg',
//         updateSpeed: 2.707692,
//     },
//     {
//         blendMode: 0,
//         capacity: 1,
//         color1: [0.9019608, 1, 0.168627456],
//         color2: [0.768627465, 1, 0.1882353],
//         colorDead: [0.6666667, 1, 0],
//         deadAlpha: 0,
//         direction1: [1, 0, 0],
//         direction2: [1, 0, 0],
//         emitRate: 1,
//         maxAngularSpeed: 0,
//         maxEmitBox: [1.278619, 0.7926775, 0],
//         maxEmitPower: 3.507097,
//         maxLifeTime: 114.1318,
//         maxSize: 57.63959,
//         minAngularSpeed: 0,
//         minEmitBox: [-1.25921, -0.5, 0],
//         minEmitPower: 3.507097,
//         minLifeTime: 114.1318,
//         minSize: 57.63959,
//         targetStopFrame: 0,
//         textureMask: [1, 1, 1, 0],
//         textureName: 'Laser1.jpg',
//         updateSpeed: 2.707692,
//     },
//     {
//         blendMode: 0,
//         capacity: 30,
//         color1: [1, 0.549019635, 0.129411772],
//         color2: [0.819607854, 0.239215687, 1],
//         colorDead: [0, 0, 0],
//         deadAlpha: 0,
//         direction1: [1, 0, 0],
//         direction2: [1, 0, 0],
//         emitRate: 2,
//         maxAngularSpeed: 0,
//         maxEmitBox: [1.278619, 0.7926775, 0],
//         maxEmitPower: 4,
//         maxLifeTime: 30.69073,
//         maxSize: 8,
//         minAngularSpeed: 0,
//         minEmitBox: [-1.25921, -0.5, 0],
//         minEmitPower: 1,
//         minLifeTime: 0,
//         minSize: 1.395973,
//         targetStopFrame: 0,
//         textureMask: [1, 1, 1, 0],
//         textureName: 'Part.jpg',
//         updateSpeed: 0.8,
//     },
//     {
//         blendMode: 0,
//         capacity: 10,
//         color1: [1, 0.6784314, 0.0392156877],
//         color2: [1, 0.270588249, 0.0470588244],
//         colorDead: [0, 0, 0],
//         deadAlpha: 0,
//         direction1: [1, 0, 0],
//         direction2: [1, 0, 0],
//         emitRate: 10,
//         maxAngularSpeed: 0.3,
//         maxEmitBox: [22.72518, 27.53432, 20.52263],
//         maxEmitPower: 16,
//         maxLifeTime: 10,
//         maxSize: 75.30244,
//         minAngularSpeed: -0.2,
//         minEmitBox: [-22.96941, -17.69963, -21.98536],
//         minEmitPower: 13.98319,
//         minLifeTime: 1.616162,
//         minSize: 37.04915,
//         targetStopFrame: 0,
//         textureMask: [1, 1, 1, 1],
//         textureName: 'Part.jpg',
//         updateSpeed: 0.1,
//     },
// ];

const thrusterConfig: ParticleConfig = {
    blendMode: 0,
    capacity: 100,
    color1: [1, 0, 0.68235296],
    color2: [1, 0.5372549, 0.7294118],
    colorDead: [0.75686276, 0.2509804, 0],
    deadAlpha: 0,
    direction1: [0, 1, 0],
    direction2: [0, 1, 0],
    emitRate: 5,
    maxAngularSpeed: 0,
    maxEmitBox: [8.932639, 0.7926775, 7.783875],
    maxEmitPower: 4,
    maxLifeTime: 30.69073,
    maxSize: 9.66443,
    minAngularSpeed: 0,
    minEmitBox: [-8.71489, -0.5, -7.451153],
    minEmitPower: 2.823529,
    minLifeTime: 0,
    minSize: 9.66443,
    targetStopFrame: 0,
    textureMask: [1, 1, 1, 0],
    textureName: 'Part.jpg',
    updateSpeed: 0.8,
};
// {
//     blendMode: 0,
//     capacity: 100,
//     color1: [1, 0, 0.68235296],
//     color2: [1, 0.5372549, 0.7294118],
//     colorDead: [0.75686276, 0.2509804, 0],
//     deadAlpha: 0,
//     direction1: [-1, 0, 0],
//     direction2: [-1, 0, 0],
//     emitRate: 5,
//     maxAngularSpeed: 0,
//     maxEmitBox: [8.932639, 7.99268, 7.783875],
//     maxEmitPower: 4,
//     maxLifeTime: 30.69073,
//     maxSize: 9.66443,
//     minAngularSpeed: 0,
//     minEmitBox: [-8.71489, -4.1, -7.451153],
//     minEmitPower: 2.823529,
//     minLifeTime: 0,
//     minSize: 9.66443,
//     targetStopFrame: 0,
//     textureMask: [1, 1, 1, 0],
//     textureName: 'Part.jpg',
//     updateSpeed: 0.8,
// },
export function thruster(id: string, scene: Scene, emitter: AbstractMesh, direction: XYZ) {
    return makeParticlesSystem(`p ${id}`, scene, emitter, thrusterConfig, direction);
}
