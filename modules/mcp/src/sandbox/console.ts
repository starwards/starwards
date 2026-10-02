import { InvalidCommandError, NotPermittedError, StationSession } from './session';
import { StationWidget, isRadarWidget, stationCommands, stationWidgets } from '@starwards/core/internal';
import { helmsRadarRange, scanBeamStatus, widgetReaders } from '../readers';

import { commandBindings } from './command-map';
import { describeContact } from '../contacts';

/**
 * What a seat reads and does, as plain functions over a `StationSession`.
 *
 * The live MCP tools and an in-process bot (`modules/ai`) both call these, so a bot sees exactly the
 * percepts and affordances a live seat does — two implementations would drift into two fog-of-war rules.
 */

/** What the seat can do right now: readable widgets, issuable commands, and the live counts they index into. */
export function stationCapabilities(session: StationSession) {
    const commands = (session.isGameMaster ? [...stationCommands] : session.commands).map((command) => {
        const binding = commandBindings[command];
        const base: Record<string, unknown> = { command, kind: binding.kind };
        if (binding.kind === 'fixed') {
            base.value = binding.value;
            base.range = session.rangeOf(binding.pointer);
        } else if (binding.kind === 'indexed') {
            base.value = binding.value;
            base.collection = binding.collection;
            base.count = session.shipDriver.state[binding.collection]?.length ?? 0;
        } else if (binding.kind === 'system') {
            base.value = binding.value;
            base.systems = session.shipDriver.systems.map((sys) => sys.pointer);
        } else if (binding.kind === 'beam') {
            base.value = binding.value;
            base.beam = session.scanBeamPointer ?? null;
        }
        return base;
    });
    return {
        station: session.stationName,
        shipId: session.shipDriver.id,
        gameMaster: session.isGameMaster,
        widgets: session.isGameMaster ? [...stationWidgets] : session.widgets,
        radars: session.isGameMaster ? ['gm'] : session.radarWidgets,
        commands,
    };
}

/** Everything the seat's radar shows, nearest first. Throws `NotPermittedError` for a seat without a radar. */
export function radarContacts(session: StationSession, { offset, limit }: { offset: number; limit: number }) {
    if (!session.isGameMaster && !session.radarWidgets.length) {
        throw new NotPermittedError(`station "${session.stationName}" has no radar`);
    }
    const ownShip = session.spaceDriver.state.getShip(session.shipDriver.id);
    if (!ownShip) {
        throw new InvalidCommandError('your ship is not in the space state');
    }
    const visible = session.isGameMaster
        ? session.radar.visibleObjects(undefined)
        : session.radar.seatObjects(session.viewFaction, session.widgets.filter(isRadarWidget), {
              ship: ownShip,
              warpLevel: session.shipDriver.state.warp?.currentLevel,
          });
    const contacts = [...visible]
        .filter((o) => o.id !== session.shipDriver.id)
        .map((o) => describeContact(o, session.viewFaction, ownShip.position))
        .sort((a, b) => a.distance - b.distance);
    return {
        ownShip: {
            id: ownShip.id,
            position: { x: ownShip.position.x, y: ownShip.position.y },
            heading: ownShip.angle,
        },
        radarRange: session.widgets.includes('helms-radar') ? helmsRadarRange(session) : undefined,
        scanBeam: session.widgets.includes('long-range-radar') ? scanBeamStatus(session) : undefined,
        total: contacts.length,
        offset,
        contacts: contacts.slice(offset, offset + limit),
    };
}

/** One panel's reading. Throws unless the seat holds the widget, and for radars, which `radarContacts` reads. */
export function shipStatus(session: StationSession, widget: StationWidget): unknown {
    session.requireWidget(widget);
    const reader = widgetReaders[widget];
    if (!reader) {
        throw new InvalidCommandError(`${widget} is a radar — use get_radar_contacts`);
    }
    return reader(session);
}

/** A panel whose reader threw: reported in place so one broken panel does not blind the whole seat. */
type UnreadablePanel = { unreadable: string };

/**
 * The whole seat at a glance: every non-radar panel by widget name, the radar picture when the seat
 * has one, and the capabilities. Mirrors a client that reads each panel in turn, so a panel that
 * fails to read is reported as unreadable rather than failing the rest.
 */
export function observeStation(session: StationSession, { radarLimit }: { radarLimit: number }) {
    const widgets = session.isGameMaster ? [...stationWidgets] : session.widgets;
    const panels: Partial<Record<StationWidget, unknown>> = {};
    for (const widget of widgets) {
        if (!widgetReaders[widget]) {
            continue;
        }
        try {
            panels[widget] = shipStatus(session, widget);
        } catch (e) {
            panels[widget] = { unreadable: (e as Error).message ?? String(e) } satisfies UnreadablePanel;
        }
    }
    const hasRadar = session.isGameMaster || session.radarWidgets.length > 0;
    return {
        panels,
        radar: hasRadar ? radarContacts(session, { offset: 0, limit: radarLimit }) : undefined,
        capabilities: stationCapabilities(session),
    };
}
