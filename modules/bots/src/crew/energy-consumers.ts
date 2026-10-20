import { StationCommand, shipConfigurations } from '@starwards/core/internal';

import { commandBindings } from '../session/command-map';

/**
 * Ship-state roots a console command writes that are not systems themselves, by the system whose
 * energy they spend: the smart pilot and the afterburner drive the thrusters.
 */
const ROOT_SYSTEM: Record<string, string> = {
    smartPilot: 'thrusters',
    afterBurnerCommand: 'thrusters',
    antiDrift: 'thrusters',
    breaks: 'thrusters',
};

/** A design value that draws energy: any field named `energyCost…` (per use, per second or per level). */
function drawsEnergy(design: unknown): boolean {
    // a mount list holds designs, or [mount name, design] pairs
    const designs: unknown[] = Array.isArray(design)
        ? (design as unknown[]).map((d) => (Array.isArray(d) ? (d as unknown[])[1] : d))
        : [design];
    return designs.some(
        (d) => typeof d === 'object' && d !== null && Object.keys(d).some((k) => k.startsWith('energyCost')),
    );
}

/** The systems of a hull that draw energy, read from its design in core (`thrusters`, `radars`, `chainGuns`, `tubes`, `warp` on the gravitas). */
export function energyConsumers(model: keyof typeof shipConfigurations = 'gravitas'): string[] {
    return Object.entries(shipConfigurations[model])
        .filter(([, design]) => drawsEnergy(design))
        .map(([key]) => key);
}

/** The systems a console command spends energy through; every system for an engineer's power and coolant keys. */
function commandSystems(command: StationCommand, consumers: readonly string[]): string[] {
    const binding = commandBindings[command];
    switch (binding.kind) {
        case 'indexed':
            return [binding.collection];
        case 'system':
            return [...consumers];
        case 'beam':
            return ['radars'];
        case 'fixed': {
            const root = binding.pointer.split('/')[1];
            return [ROOT_SYSTEM[root] ?? root];
        }
        default:
            return [];
    }
}

/** The seats whose commands spend energy, by their offered commands: who an order to preserve energy binds. */
export function energyDrawingSeats(
    seatCommands: Record<string, readonly string[]>,
    model: keyof typeof shipConfigurations = 'gravitas',
): string[] {
    const consumers = energyConsumers(model);
    return Object.entries(seatCommands)
        .filter(([, commands]) =>
            commands.some(
                (c) =>
                    c in commandBindings &&
                    commandSystems(c as StationCommand, consumers).some((s) => consumers.includes(s)),
            ),
        )
        .map(([station]) => station);
}
