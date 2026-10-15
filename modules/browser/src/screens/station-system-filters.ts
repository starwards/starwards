export function isHelmsSystem(pointer: string): boolean {
    return (
        pointer.startsWith('/thrusters/') ||
        pointer === '/warp' ||
        pointer.startsWith('/radars/') ||
        pointer === '/maneuvering' ||
        pointer === '/smartPilot'
    );
}

export function isDradisSystem(pointer: string): boolean {
    return pointer.startsWith('/radars/');
}

export function isWeaponsSystem(pointer: string): boolean {
    return (
        pointer.startsWith('/tubes/') ||
        pointer.startsWith('/chainGuns/') ||
        pointer === '/magazine' ||
        pointer.startsWith('/radars/')
    );
}
