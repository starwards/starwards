import { AbstractMesh, Vector3 } from '@babylonjs/core';

export function initMesh(mesh: AbstractMesh, id: string, type: string, radius: number) {
    mesh.id = `mpid_${id}`;
    mesh.name = `${type} ${id}`;

    mesh.normalizeToUnitCube(true);
    mesh.scaling.scaleInPlace(radius * 2);

    // resetting rotationQuaternion to null before updating rotation
    // https://doc.babylonjs.com/divingDeeper/mesh/transforms/center_origin/rotation_quaternions
    mesh.rotation = Vector3.Zero();
}
