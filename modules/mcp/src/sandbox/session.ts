import { CommandBinding, ValueKind, commandBindings } from './command-map';
import {
    Radar,
    ShipDriver,
    SpaceDriver,
    StationCommand,
    StationEntry,
    StationWidget,
    getJsonPointer,
    isRadarWidget,
    spaceCommands,
    tryGetRange,
} from '@starwards/core/internal';

import { RadarView } from '../radar/radar-view';

/** Refused because the seat does not have it. The message names what is missing, so the caller can adapt. */
export class NotPermittedError extends Error {}
/** The call was permitted but malformed — a bad index, an out-of-range value. */
export class InvalidCommandError extends Error {}

/** How long a single burst may hold a trigger down. Long enough to matter, short enough to forget. */
const MAX_BURST_SECONDS = 5;

/**
 * One logged-in station: a seat on a ship, and the boundary of what that seat may see and do.
 *
 * The game server enforces none of this — it accepts any command any client sends, deliberately, on
 * the grounds that a LARP prop is played among trusted people. So this class is the sandbox. If a
 * check does not happen here, it does not happen.
 */
export class StationSession {
    readonly radar: RadarView;

    constructor(
        readonly stationName: string,
        readonly entry: StationEntry,
        readonly shipDriver: ShipDriver,
        readonly spaceDriver: SpaceDriver,
    ) {
        this.radar = RadarView.fromDriver(spaceDriver);
    }

    get isGameMaster(): boolean {
        return this.entry.gm === true;
    }

    /** The faction whose radar picture this station reads. A game master reads no faction's — it reads all. */
    get viewFaction(): number | undefined {
        return this.isGameMaster ? undefined : this.shipDriver.state.faction;
    }

    get widgets(): StationWidget[] {
        return this.entry.widgets ?? [];
    }

    get commands(): StationCommand[] {
        return this.entry.commands ?? [];
    }

    get radarWidgets(): StationWidget[] {
        return this.widgets.filter(isRadarWidget);
    }

    hasWidget(widget: StationWidget): boolean {
        return this.isGameMaster || this.widgets.includes(widget);
    }

    /** Throws unless the seat holds this widget, naming what the seat does hold. */
    requireWidget(widget: StationWidget): void {
        if (!this.hasWidget(widget)) {
            throw new NotPermittedError(
                `station "${this.stationName}" has no ${widget}. It can read: ${this.widgets.join(', ') || '(nothing)'}`,
            );
        }
    }

    /**
     * The scan beam this ship steers: the radar whose arc is adjustable. A ship whose radars all
     * have a fixed arc has no beam to point, and the signals seat has nothing to steer.
     */
    get scanBeamPointer(): string | undefined {
        return this.shipDriver.systems.find(
            (s) => Radar.isInstance(s.state) && s.state.design.minArc < s.state.design.maxArc,
        )?.pointer;
    }

    /**
     * ECR and the bridge engineer share one systems console, and `/ecrControl` says which end of the
     * ship is holding it. The browser destroys the other end's input rather than let both steer at
     * once; refusing the command is the headless equivalent.
     */
    private checkEcrControl(command: StationCommand): void {
        if (command !== 'systemPower' && command !== 'systemCoolant') {
            return;
        }
        const ecrHasControl = this.shipDriver.state.ecrControl;
        if (this.stationName === 'ecr' && !ecrHasControl) {
            throw new NotPermittedError('the bridge engineer is holding systems control right now, not ECR');
        }
        if (this.stationName === 'bridge-engineer' && ecrHasControl) {
            throw new NotPermittedError('ECR is holding systems control right now, not the bridge');
        }
    }

    requireCommand(command: StationCommand): CommandBinding {
        if (!this.isGameMaster && !this.commands.includes(command)) {
            throw new NotPermittedError(
                `station "${this.stationName}" cannot ${command}. It can: ${this.commands.join(', ') || '(nothing)'}`,
            );
        }
        this.checkEcrControl(command);
        return commandBindings[command];
    }

    /** The declared range of a ship field, when it has one — what a caller may legally send. */
    rangeOf(pointer: string): [number, number] | undefined {
        const jsonPointer = getJsonPointer(pointer);
        if (!jsonPointer) {
            return undefined;
        }
        const range = tryGetRange(this.shipDriver.state, jsonPointer);
        return range ? [range[0], range[1]] : undefined;
    }

    private sendNumber(pointer: string, value: number): void {
        const range = this.rangeOf(pointer);
        if (range && (value < range[0] || value > range[1])) {
            throw new InvalidCommandError(`${value} is outside the range of ${pointer}: [${range[0]}, ${range[1]}]`);
        }
        this.shipDriver.sendJsonCmd(pointer, value);
    }

    private indexedPointer(binding: Extract<CommandBinding, { kind: 'indexed' }>, index: number): string {
        const count = this.shipDriver.state[binding.collection]?.length ?? 0;
        if (!Number.isInteger(index) || index < 0 || index >= count) {
            throw new InvalidCommandError(
                `this ship has ${count} ${binding.collection}, so index must be 0..${Math.max(count - 1, 0)}`,
            );
        }
        return `/${binding.collection}/${index}/${binding.field}`;
    }

    private systemPointer(field: string, system: string | undefined): string {
        const known = this.shipDriver.systems.map((s) => s.pointer);
        if (!system || !known.includes(system)) {
            throw new InvalidCommandError(`name one of this ship's systems: ${known.join(', ')}`);
        }
        return `${system}/${field}`;
    }

    /**
     * Hold a trigger down for a while, then let go. A player holds a key; a headless caller says how
     * long. The release is in a `finally` because a trigger left down is a ship that never stops
     * firing — the one failure mode worth writing extra code to prevent.
     */
    private async fireBurst(pointer: string, seconds: number): Promise<void> {
        if (!(seconds > 0) || seconds > MAX_BURST_SECONDS) {
            throw new InvalidCommandError(`seconds must be greater than 0 and at most ${MAX_BURST_SECONDS}`);
        }
        this.shipDriver.sendJsonCmd(pointer, true);
        try {
            await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        } finally {
            this.shipDriver.sendJsonCmd(pointer, false);
        }
    }

    /**
     * Issue a station command. Returns a description of what was sent, so a caller that cannot see
     * the ship still learns what it did.
     */
    async execute(
        command: StationCommand,
        args: { index?: number; system?: string; seconds?: number; id?: string; [key: string]: unknown } = {},
        value?: number | boolean | string,
    ): Promise<string> {
        const binding = this.requireCommand(command);
        switch (binding.kind) {
            case 'fixed':
                return this.sendValue(binding.pointer, binding.value, value);
            case 'indexed': {
                const pointer = this.indexedPointer(binding, args.index ?? 0);
                if (binding.value === 'burst') {
                    const seconds = args.seconds ?? 0.5;
                    await this.fireBurst(pointer, seconds);
                    return `${command} on ${pointer} for ${seconds}s`;
                }
                return this.sendValue(pointer, binding.value, value);
            }
            case 'system':
                return this.sendValue(this.systemPointer(binding.field, args.system), binding.value, value);
            case 'beam': {
                const beam = this.scanBeamPointer;
                if (!beam) {
                    throw new InvalidCommandError('this ship has no steerable scan beam');
                }
                return this.sendValue(`${beam}/${binding.field}`, binding.value, value);
            }
            case 'ship-command': {
                const parsed = binding.args.parse(args) as Record<string, unknown>;
                const cmd = { cmdName: binding.cmdName, setValue: () => undefined };
                this.shipDriver.command(cmd, parsed as never);
                return `${command} ${JSON.stringify(parsed)}`;
            }
            case 'space-command': {
                const parsed = binding.args.parse(args) as Record<string, unknown>;
                const payload = 'id' in parsed ? { ...parsed, ids: [parsed.id] } : parsed;
                const cmd = (spaceCommands as Record<string, unknown>)[binding.cmdName];
                if (!cmd) {
                    throw new InvalidCommandError(`unknown space command ${binding.cmdName}`);
                }
                this.spaceDriver.command(cmd as never, payload as never);
                return `${command} ${JSON.stringify(payload)}`;
            }
            case 'space-pointer': {
                const parsed = binding.args.parse(args) as Record<string, unknown>;
                const written = binding.fields.filter((field) => parsed[field] !== undefined);
                if (!written.length) {
                    throw new InvalidCommandError(`pass at least one of: ${binding.fields.join(', ')}`);
                }
                for (const field of written) {
                    this.spaceDriver.sendJsonCmd(
                        `/${binding.type}/${String(parsed.id)}/${field}`,
                        parsed[field] as never,
                    );
                }
                return `${command} ${written.join(', ')} on ${String(parsed.id)}`;
            }
        }
    }

    private sendValue(pointer: string, kind: ValueKind, value: unknown) {
        switch (kind) {
            case 'trigger':
                this.shipDriver.sendJsonCmd(pointer, true);
                return `${pointer} pressed`;
            case 'toggle': {
                if (typeof value !== 'boolean') {
                    throw new InvalidCommandError(`${pointer} takes a boolean value`);
                }
                this.shipDriver.sendJsonCmd(pointer, value);
                return `${pointer} set to ${value}`;
            }
            case 'number': {
                if (typeof value !== 'number') {
                    throw new InvalidCommandError(`${pointer} takes a number value`);
                }
                this.sendNumber(pointer, value);
                return `${pointer} set to ${value}`;
            }
            default:
                throw new InvalidCommandError(`${pointer} cannot be set directly`);
        }
    }
}
