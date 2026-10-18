import {
    AdminDriver,
    BridgeSeat,
    Driver,
    StationsManifest,
    botBrains,
    isAssignableSeat,
    rosterSeats,
} from '@starwards/core';

import $ from 'jquery';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';
import { hsl } from '../colors';
import { rosterModel } from './station-roster-model';

/**
 * Seat-first roster: per player ship, each roster seat with its bot's status and actions (`assignBot`)
 * and one client dropdown per screen (`assignStation`), seats nobody plays tinted UNASSIGNED; below,
 * every connected client without a ship with an assign-to-screen dropdown. Above, a reset of every
 * assignment and a warning while bots run unrecorded. A regular `DashboardWidget` in the golden-layout
 * grid (see `gm.ts`) — never a floating overlay, which would eat other widgets' clicks.
 */
export function stationRosterWidget(driver: Driver, adminDriver: AdminDriver): DashboardWidget {
    class StationRosterComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawStationRoster(container, adminDriver, (onLoaded) => createManifestCache(driver, onLoaded));
        }
    }
    return {
        name: 'station roster',
        type: 'component',
        component: StationRosterComponent,
        defaultProps: {},
    };
}

/** The enabled (assignable) station types per ship; `undefined` while not known yet. */
type EnabledScreens = { getEnabledTypes(shipId: string): readonly string[] | undefined };

/**
 * The enabled station types for a ship, fetched from `/stations-manifest/:shipId` and cached per
 * shipId. Returns `undefined` while the first fetch for that ship is in flight — the caller shows no
 * screens for that ship until `onLoaded` fires a re-render.
 */
function createManifestCache(driver: Driver, onLoaded: () => void): EnabledScreens {
    const cache = new Map<string, string[]>();
    const pending = new Set<string>();
    return {
        getEnabledTypes(shipId: string): string[] | undefined {
            if (!shipId) {
                return [];
            }
            const cached = cache.get(shipId);
            if (cached) {
                return cached;
            }
            if (!pending.has(shipId)) {
                pending.add(shipId);
                void fetch(`${driver.httpEndpoint}/stations-manifest/${encodeURIComponent(shipId)}`)
                    .then((res) => res.json() as Promise<StationsManifest>)
                    .then((manifest) => {
                        cache.set(
                            shipId,
                            Object.entries(manifest.stations)
                                .filter(([, entry]) => isAssignableSeat(entry))
                                .map(([name]) => name),
                        );
                    })
                    .catch(() => cache.set(shipId, []))
                    .finally(() => {
                        pending.delete(shipId);
                        onLoaded();
                    });
            }
            return undefined;
        },
    };
}

type RosterBot = { brain: string; status: string; message: string };
type RosterStation = { id: string; connected: boolean; shipId: string; stationType: string };

/** The slice of `AdminDriver` the roster reads and drives. */
export type RosterAdmin = Pick<AdminDriver, 'assignBot' | 'assignStation' | 'resetAssignments'> & {
    readonly state: {
        readonly playerShipIds: Iterable<string>;
        readonly stations: { values(): Iterable<RosterStation> };
        readonly bots: { get(shipId: string): { seats: { get(seat: string): RosterBot | undefined } } | undefined };
        readonly isRecordingGame: boolean;
    };
    readonly events: Pick<AdminDriver['events'], 'on' | 'off'>;
};

const buttonCss = { marginRight: '0.3em', font: 'inherit' };

export function drawStationRoster(
    container: WidgetContainer,
    adminDriver: RosterAdmin,
    enabledScreens: (onLoaded: () => void) => EnabledScreens,
): void {
    const root = container.getElement();
    root.attr('data-id', 'Station Roster').css({
        overflowY: 'auto',
        padding: '0.5em 0.75em',
        fontFamily: 'sans-serif',
        fontSize: '0.8em',
        color: hsl.primary.main(3),
    });
    const banner = $('<div />')
        .attr('data-id', 'Roster Bots Not Recording')
        .text('bots running, not recording')
        .css({
            display: 'none',
            padding: '0.3em 0.5em',
            marginBottom: '0.4em',
            fontWeight: 'bold',
            color: hsl.secondary,
            border: `1px solid ${hsl.secondary}`,
        });
    // a disconnected entry on a screen the roster does not show still holds its slot; reset frees it
    const reset = $('<button />')
        .attr('data-id', 'Roster Reset')
        .attr('title', 'unassign every screen and stop every bot')
        .text('reset assignments')
        .css(buttonCss)
        .on('click', () => adminDriver.resetAssignments());
    const shipsList = $('<div />');
    const unassignedList = $('<div />').attr('data-id', 'Roster Unassigned');
    root.append(
        banner,
        $('<div />').css({ marginBottom: '0.4em' }).append(reset),
        shipsList,
        $('<div />').text('Unassigned clients').css({ marginTop: '0.6em' }),
        unassignedList,
    );

    const manifests = enabledScreens(render);

    /** Replaces a select's options only when they actually changed, then syncs its value. */
    function syncOptions(select: JQuery<HTMLElement>, options: [value: string, text: string][], selected: string) {
        const current = select
            .children('option')
            .toArray()
            .map((o) => `${o.value}\u0000${o.textContent ?? ''}`)
            .join('\u0001');
        const wanted = options.map(([value, text]) => `${value}\u0000${text}`).join('\u0001');
        if (current !== wanted) {
            select.empty();
            for (const [value, text] of options) {
                select.append($('<option />').attr('value', value).text(text));
            }
        }
        if (select.val() !== selected) {
            select.val(selected);
        }
    }

    type SeatRow = {
        row: JQuery<HTMLElement>;
        label: JQuery<HTMLElement>;
        botStatus: JQuery<HTMLElement>;
        seatBotButtons: JQuery<HTMLElement>[];
        restartBot: JQuery<HTMLElement>;
        removeBot: JQuery<HTMLElement>;
        screensCell: JQuery<HTMLElement>;
        screenSelects: Map<string, JQuery<HTMLElement>>;
    };
    // Rows are created once and updated in place, keyed by `ship|seat` and by station id — never
    // rebuilt or moved — so a control the GM has focused/open survives other updates (issue #2336).
    // Every bot button exists from the start and is only shown or hidden.
    const shipBlocks = new Map<string, JQuery<HTMLElement>>();
    const seatRows = new Map<string, SeatRow>();
    const unassignedRows = new Map<string, { row: JQuery<HTMLElement>; select: JQuery<HTMLElement> }>();

    function createSeatRow(shipId: string, seat: BridgeSeat): SeatRow {
        const row = $('<tr />').attr('data-id', `Roster Seat ${shipId} ${seat}`);
        const label = $('<td />');
        const botStatus = $('<span />')
            .attr('data-id', `Roster Bot Status ${shipId} ${seat}`)
            .css({ marginRight: '0.4em' });
        const button = (dataId: string, text: string, onClick: () => void) =>
            $('<button />')
                .attr('data-id', `${dataId} ${shipId} ${seat}`)
                .text(text)
                .css(buttonCss)
                .on('click', onClick);
        const seatBotButtons = botBrains.map((brain) =>
            button(`Roster Bot Seat ${brain}`, `seat ${brain}`, () => adminDriver.assignBot({ shipId, seat, brain })),
        );
        // re-seating a failed bot's own brain is what restarts it (GameManager.assignBot)
        const restartBot = button('Roster Bot Restart', 'restart', () => {
            const brain = adminDriver.state.bots.get(shipId)?.seats.get(seat)?.brain;
            if (brain) adminDriver.assignBot({ shipId, seat, brain });
        });
        const removeBot = button('Roster Bot Remove', 'remove', () =>
            adminDriver.assignBot({ shipId, seat, brain: 'none' }),
        );
        const screensCell = $('<td />');
        const botCell = $('<td />')
            .attr('data-id', `Roster Bot ${shipId} ${seat}`)
            .append(botStatus, ...seatBotButtons, restartBot, removeBot);
        row.append(label, botCell, screensCell);
        return { row, label, botStatus, seatBotButtons, restartBot, removeBot, screensCell, screenSelects: new Map() };
    }

    function createScreenSelect(shipId: string, screen: string) {
        const select = $('<select />')
            .attr('data-id', `Roster Screen ${shipId} ${screen}`)
            .css({ marginRight: '0.3em' });
        select.on('change', () => {
            const stationId = String(select.val() ?? '');
            if (stationId) {
                adminDriver.assignStation({ stationId, shipId, stationType: screen });
                return;
            }
            for (const entry of adminDriver.state.stations.values()) {
                if (entry.shipId === shipId && entry.stationType === screen) {
                    adminDriver.assignStation({ stationId: entry.id, shipId: '', stationType: '' });
                }
            }
        });
        return select;
    }

    function createShipBlock(shipId: string) {
        const table = $('<table />').css({ borderCollapse: 'collapse', width: '100%' });
        table.append($('<tr />').append($('<th>seat</th>'), $('<th>bot</th>'), $('<th>screens</th>')));
        for (const seat of rosterSeats) {
            const seatRow = createSeatRow(shipId, seat);
            seatRows.set(`${shipId}|${seat}`, seatRow);
            table.append(seatRow.row);
        }
        return $('<div />').append($('<div />').attr('data-id', `Roster Ship ${shipId}`).text(shipId), table);
    }

    function createUnassignedRow(stationId: string) {
        const select = $('<select />').attr('data-id', 'Roster Unassigned Assign');
        select.on('change', () => {
            const [shipId = '', stationType = ''] = String(select.val() ?? '').split('|');
            if (shipId && stationType) {
                adminDriver.assignStation({ stationId, shipId, stationType });
            }
        });
        const row = $('<div />')
            .attr('data-id', `Roster Unassigned ${stationId}`)
            .css({ display: 'flex', gap: '0.4em', padding: '0.15em 0' })
            .append($('<span />').text(stationId), select);
        return { row, select };
    }

    function render() {
        const stations = [...adminDriver.state.stations.values()];
        const model = rosterModel({
            playerShipIds: [...adminDriver.state.playerShipIds],
            stations,
            bots: (shipId, seat) => adminDriver.state.bots.get(shipId)?.seats.get(seat),
            enabledScreens: (shipId) => manifests.getEnabledTypes(shipId) ?? [],
        });
        banner.toggle(model.botsRunning && !adminDriver.state.isRecordingGame);
        const clientOptions = (holder: (typeof stations)[number] | null): [string, string][] => [
            ['', '— none —'],
            ...stations
                .filter((e) => e.connected || e === holder)
                .map((e): [string, string] => [e.id, `${e.connected ? '●' : '○'} ${e.id}`]),
        ];
        const seatOptions: [string, string][] = [['', 'assign to…']];

        for (const { shipId, seats } of model.ships) {
            if (!shipBlocks.has(shipId)) {
                const block = createShipBlock(shipId);
                shipBlocks.set(shipId, block);
                shipsList.append(block);
            }
            for (const { seat, bot, botBlockedBy, screens, unassigned } of seats) {
                const seatRow = seatRows.get(`${shipId}|${seat}`);
                if (!seatRow) {
                    continue;
                }
                seatRow.label.text(unassigned ? `${seat} UNASSIGNED` : seat);
                seatRow.row
                    .attr('data-unassigned', String(unassigned))
                    .css('background', unassigned ? `color-mix(in srgb, ${hsl.error} 30%, transparent)` : '');
                seatRow.botStatus
                    .text(bot ? `${bot.brain} ${bot.status}${bot.message ? `: ${bot.message}` : ''}` : 'none')
                    .attr('data-status', bot?.status ?? 'none')
                    .css('color', bot?.status === 'failed' ? hsl.error : '');
                const blockedTitle = botBlockedBy ? `the ${botBlockedBy} bot plays this seat's station` : '';
                for (const button of seatRow.seatBotButtons) {
                    button.toggle(!bot).prop('disabled', !!botBlockedBy).attr('title', blockedTitle);
                }
                seatRow.restartBot.toggle(bot?.status === 'failed');
                seatRow.removeBot.toggle(!!bot);
                const seen = new Set<string>();
                for (const { screen, holder } of screens) {
                    seen.add(screen);
                    seatOptions.push([`${shipId}|${screen}`, `${shipId} / ${seat} / ${screen}`]);
                    let select = seatRow.screenSelects.get(screen);
                    if (!select) {
                        select = createScreenSelect(shipId, screen);
                        seatRow.screenSelects.set(screen, select);
                        seatRow.screensCell.append(select);
                    }
                    syncOptions(select, clientOptions(holder), holder?.id ?? '');
                }
                for (const [screen, select] of [...seatRow.screenSelects]) {
                    if (!seen.has(screen)) {
                        select.remove();
                        seatRow.screenSelects.delete(screen);
                    }
                }
            }
        }
        for (const [shipId, block] of [...shipBlocks]) {
            if (!model.ships.some((s) => s.shipId === shipId)) {
                block.remove();
                shipBlocks.delete(shipId);
                for (const seat of rosterSeats) {
                    seatRows.delete(`${shipId}|${seat}`);
                }
            }
        }

        for (const stationId of model.unassignedClients) {
            let elements = unassignedRows.get(stationId);
            if (!elements) {
                elements = createUnassignedRow(stationId);
                unassignedRows.set(stationId, elements);
                unassignedList.append(elements.row);
            }
            syncOptions(elements.select, seatOptions, '');
        }
        for (const [stationId, { row }] of [...unassignedRows]) {
            if (!model.unassignedClients.includes(stationId)) {
                row.remove();
                unassignedRows.delete(stationId);
            }
        }
    }
    render();
    const paths = ['/stations', '/stations/**', '/playerShipIds', '/bots', '/bots/**', '/isRecordingGame'];
    for (const path of paths) {
        adminDriver.events.on(path, render);
    }
    container.on('destroy', () => {
        for (const path of paths) {
            adminDriver.events.off(path, render);
        }
    });
}
