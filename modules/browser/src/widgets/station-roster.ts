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
 * Seat-first roster: per player ship, each roster seat with its bot dropdown (`assignBot`) and one
 * client dropdown per screen (`assignStation`), seats with neither tinted UNASSIGNED; below, every
 * connected client without a ship with an assign-to-screen dropdown. A regular `DashboardWidget`
 * in the golden-layout grid (see `gm.ts`) — never a floating overlay, which would eat other
 * widgets' clicks.
 */
export function stationRosterWidget(driver: Driver, adminDriver: AdminDriver): DashboardWidget {
    class StationRosterComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawStationRoster(container, driver, adminDriver);
        }
    }
    return {
        name: 'station roster',
        type: 'component',
        component: StationRosterComponent,
        defaultProps: {},
    };
}

/**
 * The enabled (assignable) station types for a ship, fetched from `/stations-manifest/:shipId`
 * and cached per shipId. Returns `undefined` while the first fetch for that ship is in flight —
 * the caller shows no screens for that ship until `onLoaded` fires a re-render.
 */
function createManifestCache(driver: Driver, onLoaded: () => void) {
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

function drawStationRoster(container: WidgetContainer, driver: Driver, adminDriver: AdminDriver): void {
    const root = container.getElement();
    root.attr('data-id', 'Station Roster').css({
        overflowY: 'auto',
        padding: '0.5em 0.75em',
        fontFamily: 'sans-serif',
        fontSize: '0.8em',
        color: hsl.primary.main(3),
    });
    const shipsList = $('<div />');
    const unassignedList = $('<div />').attr('data-id', 'Roster Unassigned');
    root.append(shipsList, $('<div />').text('Unassigned clients').css({ marginTop: '0.6em' }), unassignedList);

    const manifests = createManifestCache(driver, render);

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
        botSelect: JQuery<HTMLElement>;
        botStatus: JQuery<HTMLElement>;
        screensCell: JQuery<HTMLElement>;
        screenSelects: Map<string, JQuery<HTMLElement>>;
    };
    // Rows are created once and updated in place, keyed by `ship|seat` and by station id — never
    // rebuilt or moved — so a dropdown the GM has focused/open survives other updates (issue #2336).
    const shipBlocks = new Map<string, JQuery<HTMLElement>>();
    const seatRows = new Map<string, SeatRow>();
    const unassignedRows = new Map<string, { row: JQuery<HTMLElement>; select: JQuery<HTMLElement> }>();

    function createSeatRow(shipId: string, seat: BridgeSeat): SeatRow {
        const row = $('<tr />').attr('data-id', `Roster Seat ${shipId} ${seat}`);
        const label = $('<td />');
        const botSelect = $('<select />').attr('data-id', `Roster Bot ${shipId} ${seat}`);
        const botStatus = $('<span />')
            .attr('data-id', `Roster Bot Status ${shipId} ${seat}`)
            .css({ marginLeft: '0.4em' });
        const screensCell = $('<td />');
        botSelect.on('change', () => adminDriver.assignBot({ shipId, seat, brain: String(botSelect.val() ?? 'none') }));
        row.append(label, $('<td />').append(botSelect, botStatus), screensCell);
        return { row, label, botSelect, botStatus, screensCell, screenSelects: new Map() };
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
                syncOptions(
                    seatRow.botSelect,
                    [['none', 'none'], ...botBrains.map((b): [string, string] => [b, b])],
                    bot?.brain ?? 'none',
                );
                seatRow.botSelect
                    .prop('disabled', !!botBlockedBy)
                    .attr('title', botBlockedBy ? `the ${botBlockedBy} bot plays this seat's station` : '');
                seatRow.botStatus.text(
                    !bot || bot.status === 'running' ? '' : bot.status + (bot.message ? `: ${bot.message}` : ''),
                );
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
    const paths = ['/stations', '/stations/**', '/playerShipIds', '/bots', '/bots/**'];
    for (const path of paths) {
        adminDriver.events.on(path, render);
    }
    container.on('destroy', () => {
        for (const path of paths) {
            adminDriver.events.off(path, render);
        }
    });
}
