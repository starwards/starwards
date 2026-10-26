import { Display, Press } from './controls';

/** The pointers of the systems the display lists as offline: a hack has disabled them until they recover. */
export function offlinePointers(display: Display): Set<string> {
    const offline = new Set<string>();
    for (const name of ['systems-status', 'full-systems-status']) {
        const systems = display.panels[name];
        for (const system of Array.isArray(systems) ? (systems as { pointer: string; offline?: boolean }[]) : []) {
            if (system.offline) {
                offline.add(system.pointer);
            }
        }
    }
    return offline;
}

const gunCommands = new Set(['fireChainGun', 'loadChainGun', 'changeGunAmmo']);
const tubeCommands = new Set(['fireTube', 'loadTube', 'changeTubeAmmo', 'tubeSafety']);
const warpCommands = new Set(['warpUp', 'warpDown', 'warpFrequency', 'changeFrequency']);

/** The system pointer a press operates, when the press names one. */
function pressedSystem({ command, args }: Press): string | undefined {
    if (typeof args.system === 'string') {
        return args.system;
    }
    if (gunCommands.has(command)) return `/chainGuns/${String(args.index)}`;
    if (tubeCommands.has(command)) return `/tubes/${String(args.index)}`;
    if (warpCommands.has(command)) return '/warp';
    return undefined;
}

/** True when the press would command a system that is offline: a disabled system takes no commands until it recovers. */
export function pressesOfflineSystem(press: Press, offline: ReadonlySet<string>): boolean {
    const system = pressedSystem(press);
    return system !== undefined && offline.has(system);
}
