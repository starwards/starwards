import { AdminDriver, Driver, StationsManifest, isAssignableSeat } from '@starwards/core';

import $ from 'jquery';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';
import { hsl } from '../colors';

/**
 * Roster of every registered station (`AdminState.stations`): connected indicator, and per-row
 * ship/station-type dropdowns the GM uses to bind (or move, or unassign) a station — sending
 * `assignStation` on change (issue #2132). A regular `DashboardWidget` living in the
 * golden-layout grid (see `gm.ts`) — never a floating overlay, which would sit on top of other
 * widgets and eat their clicks.
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
 * the caller falls back to just the row's current station type until `onLoaded` fires a re-render.
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
    const list = $('<div />').attr('data-id', 'Station Roster List');
    root.append(list);

    const manifests = createManifestCache(driver, render);
    // A ship the GM just picked in a row's dropdown, before a station type has been chosen to
    // go with it: `assignStation` needs both non-empty at once (see `GameManager`), so this
    // pick can't be sent yet. Tracked here — outside `entry.shipId`, the server-confirmed value
    // — purely to drive the type dropdown's options for the *ship being considered*, not the
    // ship still on record. Cleared once the server confirms the pair (entry.shipId catches up).
    const pendingShipByStation = new Map<string, string>();

    type RowElements = {
        row: JQuery<HTMLElement>;
        label: JQuery<HTMLElement>;
        shipSelect: JQuery<HTMLElement>;
        typeSelect: JQuery<HTMLElement>;
    };
    // Rows are updated in place, keyed by station id — never rebuilt — so a dropdown the GM has
    // focused/open survives other stations joining, leaving or being assigned (issue #2336).
    const rows = new Map<string, RowElements>();

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

    function createRow(stationId: string): RowElements {
        const row = $('<div />')
            .attr('data-id', `Station Roster Row ${stationId}`)
            .css({ display: 'flex', alignItems: 'center', gap: '0.4em', padding: '0.15em 0' });
        const label = $('<span />');
        const shipSelect = $('<select />').attr('data-id', 'Station Roster Ship');
        const typeSelect = $('<select />').attr('data-id', 'Station Roster Type');

        shipSelect.on('change', () => {
            const entry = adminDriver.state.stations.get(stationId);
            if (!entry) {
                return;
            }
            const newShipId = String(shipSelect.val() ?? '');
            if (!newShipId) {
                pendingShipByStation.delete(stationId);
                adminDriver.assignStation({ stationId, shipId: '', stationType: '' });
                return;
            }
            pendingShipByStation.set(stationId, newShipId);
            if (entry.stationType) {
                // moving an already-typed station (self-assigned, or a prior GM pick) to a
                // new ship: carry its type over rather than making the GM re-pick it. The
                // server is the final authority (`GameManager.isValidStationSlot`), so a
                // type the new ship's manifest doesn't support is just a safe no-op.
                adminDriver.assignStation({ stationId, shipId: newShipId, stationType: entry.stationType });
            } else {
                // no type yet: widen the type dropdown for the new ship and wait for a pick
                render();
            }
        });
        typeSelect.on('change', () => {
            const entry = adminDriver.state.stations.get(stationId);
            const selectedShipId = pendingShipByStation.get(stationId) ?? entry?.shipId ?? '';
            const stationType = String(typeSelect.val() ?? '');
            if (selectedShipId && stationType) {
                adminDriver.assignStation({ stationId, shipId: selectedShipId, stationType });
            }
        });

        row.append(label, shipSelect, typeSelect);
        return { row, label, shipSelect, typeSelect };
    }

    function render() {
        const playerShipIds = [...adminDriver.state.playerShipIds];
        const seen = new Set<string>();
        let previous: JQuery<HTMLElement> | null = null;
        for (const entry of adminDriver.state.stations.values()) {
            seen.add(entry.id);
            if (pendingShipByStation.get(entry.id) === entry.shipId) {
                pendingShipByStation.delete(entry.id);
            }
            const selectedShipId = pendingShipByStation.get(entry.id) ?? entry.shipId;
            const selectedType = selectedShipId === entry.shipId ? entry.stationType : '';

            let elements = rows.get(entry.id);
            if (!elements) {
                elements = createRow(entry.id);
                rows.set(entry.id, elements);
                // only new rows are placed; existing rows are never moved (moving blurs a focused select)
                if (previous) {
                    elements.row.insertAfter(previous);
                } else {
                    list.prepend(elements.row);
                }
            }
            const { row, label, shipSelect, typeSelect } = elements;
            previous = row;

            label.text(`${entry.connected ? '●' : '○'} ${entry.id}`);

            const shipOptions =
                selectedShipId && !playerShipIds.includes(selectedShipId)
                    ? [...playerShipIds, selectedShipId]
                    : playerShipIds;
            syncOptions(
                shipSelect,
                [['', 'unassigned'], ...shipOptions.map((id): [string, string] => [id, id])],
                selectedShipId,
            );

            const enabledTypes = manifests.getEnabledTypes(selectedShipId) ?? [];
            const typeOptions =
                selectedType && !enabledTypes.includes(selectedType) ? [...enabledTypes, selectedType] : enabledTypes;
            typeSelect.prop('disabled', !selectedShipId);
            syncOptions(typeSelect, [['', '-'], ...typeOptions.map((t): [string, string] => [t, t])], selectedType);
        }
        for (const [stationId, { row }] of [...rows]) {
            if (!seen.has(stationId)) {
                row.remove();
                rows.delete(stationId);
                pendingShipByStation.delete(stationId);
            }
        }
    }
    render();
    adminDriver.events.on('/stations', render);
    adminDriver.events.on('/stations/**', render);
    adminDriver.events.on('/playerShipIds', render);
    container.on('destroy', () => {
        adminDriver.events.off('/stations', render);
        adminDriver.events.off('/stations/**', render);
        adminDriver.events.off('/playerShipIds', render);
    });
}
