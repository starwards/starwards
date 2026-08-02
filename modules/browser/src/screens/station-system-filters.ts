export function isPilotSystem(pointer: string): boolean {
    return (
        pointer.startsWith('/thrusters/') ||
        pointer === '/warp' ||
        pointer.startsWith('/radars/') ||
        pointer === '/maneuvering' ||
        pointer === '/smartPilot'
    );
}

export function isWeaponsSystem(pointer: string): boolean {
    return (
        pointer.startsWith('/tubes/') ||
        pointer.startsWith('/chainGuns/') ||
        pointer === '/magazine' ||
        pointer.startsWith('/radars/')
    );
}
