import { ControlDesign, ValueSource, controlCatalogue } from './catalogue';

import { StationCommand } from '@starwards/core/internal';

/** What the station shows: every panel by widget name, and the radar if it has one. */
export type Display = { panels: Record<string, unknown>; radar?: unknown };

/** The station's affordances, as `get_capabilities` reports them. */
export type Capabilities = {
    commands: ReadonlyArray<{ command: string; count?: number; systems?: readonly string[] }>;
};

/** One command for the station console, in `execute_command` form. */
export type Press = { command: StationCommand; args: Record<string, unknown>; value?: number | boolean };

/**
 * One physical control and the mutually exclusive things a player can do with it right now.
 * `options` maps each option name to a plain description; `press` turns a chosen option into the
 * command the console needs, or nothing when the option is to leave the control alone.
 */
export type Control = {
    id: string;
    command: StationCommand;
    options: Record<string, string>;
    /** The option that changes nothing: what an absent player does. */
    rest: string;
    press(option: string): Press | undefined;
};

type ExpandContext = { display: Display; capabilities: Capabilities; burstSeconds: number };

const hold = 'leave it as it is';

/**
 * Every control this station offers at this moment, one per physical control: per-gun and
 * per-system controls are expanded, mutually exclusive keys are folded into one control, and
 * excluded commands are dropped.
 */
export function stationControls({ display, capabilities, burstSeconds }: ExpandContext): Control[] {
    const offered = new Map(capabilities.commands.map((c) => [c.command, c] as const));
    const controls: Control[] = [];
    const groups = new Map<string, Map<string, StationCommand>>();
    for (const command of Object.keys(controlCatalogue) as StationCommand[]) {
        const capability = offered.get(command);
        const design: ControlDesign = controlCatalogue[command];
        if (!capability || design.kind === 'excluded') {
            continue;
        }
        if (design.kind === 'group') {
            const members = groups.get(design.group) ?? new Map<string, StationCommand>();
            members.set(design.option, command);
            groups.set(design.group, members);
            continue;
        }
        for (const key of expansionKeys(design, capability, display)) {
            controls.push(expandControl(command, design, key, display, burstSeconds));
        }
    }
    for (const [group, members] of groups) {
        controls.push(groupControl(group, members));
    }
    return controls;
}

type Key = { suffix: string; args: Record<string, unknown>; fill: string | number | undefined };

function expansionKeys(design: ControlDesign, capability: Capabilities['commands'][number], display: Display): Key[] {
    const expand = 'expand' in design ? design.expand : 'single';
    if (design.kind === 'protocol') {
        const slots = (panel(display, 'repair-queue') as { slots?: { protocolId: string }[] } | undefined)?.slots ?? [];
        return slots.map((s) => ({
            suffix: `:${s.protocolId}`,
            args: { protocolId: s.protocolId },
            fill: s.protocolId,
        }));
    }
    if (expand === 'gun') {
        return Array.from({ length: capability.count ?? 0 }, (_, index) => ({
            suffix: `:${index}`,
            args: { index },
            fill: index,
        }));
    }
    if (expand === 'system') {
        return (capability.systems ?? []).map((system) => ({ suffix: `:${system}`, args: { system }, fill: system }));
    }
    return [{ suffix: '', args: {}, fill: undefined }];
}

function expandControl(
    command: StationCommand,
    design: ControlDesign,
    key: Key,
    display: Display,
    burstSeconds: number,
): Control {
    const id = `${command}${key.suffix}`;
    const current = 'read' in design ? readValue(display, design.read, key.fill) : undefined;
    const send = (value?: number | boolean, extra: Record<string, unknown> = {}): Press => ({
        command,
        args: { ...key.args, ...extra },
        value,
    });
    switch (design.kind) {
        case 'axis': {
            const now = typeof current === 'number' ? current : (design.centre ?? design.min);
            const step = (sign: number) =>
                send(Math.min(design.max, Math.max(design.min, round(now + sign * design.step))));
            const options: Record<string, string> = {
                [design.up]: `press the ${design.up} key once (one step of ${design.step})`,
                [design.down]: `press the ${design.down} key once (one step of ${design.step})`,
                hold,
            };
            if (design.centre !== undefined) {
                options.centre = `press both keys: return to ${design.centre}`;
            }
            return {
                id,
                command,
                options,
                rest: 'hold',
                press: (o) =>
                    o === design.up
                        ? step(1)
                        : o === design.down
                          ? step(-1)
                          : o === 'centre'
                            ? send(design.centre)
                            : undefined,
            };
        }
        case 'held':
            return {
                id,
                command,
                options: { engage: 'hold the key down', release: 'let go of the key' },
                rest: current === 1 ? 'engage' : 'release',
                press: (o) =>
                    o === 'engage'
                        ? current === 1
                            ? undefined
                            : send(1)
                        : o === 'release' && typeof current === 'number' && current > 0
                          ? send(0)
                          : undefined,
            };
        case 'switch':
            return {
                id,
                command,
                options: { on: 'switch it on', off: 'switch it off' },
                rest: current === true ? 'on' : 'off',
                press: (o) =>
                    (o === 'on') === current ? undefined : o === 'on' || o === 'off' ? send(o === 'on') : undefined,
            };
        case 'press':
            return {
                id,
                command,
                options: { press: 'press the key once', wait: 'do not press it' },
                rest: 'wait',
                press: (o) => (o === 'press' ? send(design.value) : undefined),
            };
        case 'burst':
            return {
                id,
                command,
                options: { fire: `pull the trigger for ${burstSeconds} seconds`, hold_fire: 'do not fire' },
                rest: 'hold_fire',
                press: (o) => (o === 'fire' ? send(undefined, { seconds: burstSeconds }) : undefined),
            };
        case 'protocol':
            return {
                id,
                command,
                options: {
                    ...Object.fromEntries(
                        Object.keys(design.options).map((o) => [o, `${o.replace('_', ' ')} for this repair protocol`]),
                    ),
                    none: hold,
                },
                rest: 'none',
                press: (o) => (o in design.options ? send(undefined, design.options[o]) : undefined),
            };
        default:
            throw new Error(`control ${id} of kind ${design.kind} cannot be expanded`);
    }
}

function groupControl(group: string, members: Map<string, StationCommand>): Control {
    const options: Record<string, string> = {};
    for (const option of members.keys()) {
        options[option] = `press the ${option} key`;
    }
    options.none = 'press none of them';
    const first = [...members.values()][0];
    return {
        id: group,
        command: first,
        options,
        rest: 'none',
        press: (o) => {
            const command = members.get(o);
            return command ? { command, args: {}, value: true } : undefined;
        },
    };
}

function panel(display: Display, name: string) {
    return display.panels[name];
}

function readValue(display: Display, source: ValueSource, fill: string | number | undefined): unknown {
    let node: unknown = 'radar' in source ? display.radar : panel(display, source.panel);
    if ('listKey' in source) {
        node = Array.isArray(node)
            ? node.find((entry: Record<string, unknown>) => entry[source.listKey] === fill)
            : undefined;
    }
    const path = 'radar' in source ? source.radar : source.path;
    for (const step of path) {
        node = node && typeof node === 'object' ? (node as Record<string, unknown>)[step] : undefined;
    }
    return node;
}

/** Steps accumulate in floating point; keep values on the console's own grid. */
function round(value: number) {
    return Math.round(value * 1e6) / 1e6;
}
