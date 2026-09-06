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

    function render() {
        list.empty();
        const playerShipIds = [...adminDriver.state.playerShipIds];
        for (const entry of adminDriver.state.stations.values()) {
            if (pendingShipByStation.get(entry.id) === entry.shipId) {
                pendingShipByStation.delete(entry.id);
            }
            const selectedShipId = pendingShipByStation.get(entry.id) ?? entry.shipId;
            const selectedType = selectedShipId === entry.shipId ? entry.stationType : '';

            const row = $('<div />')
                .attr('data-id', `Station Roster Row ${entry.id}`)
                .css({ display: 'flex', alignItems: 'center', gap: '0.4em', padding: '0.15em 0' });
            row.append($('<span />').text(`${entry.connected ? '●' : '○'} ${entry.id}`));

            const shipSelect = $('<select />').attr('data-id', 'Station Roster Ship');
            shipSelect.append($('<option value="">unassigned</option>'));
            const shipOptions =
                selectedShipId && !playerShipIds.includes(selectedShipId)
                    ? [...playerShipIds, selectedShipId]
                    : playerShipIds;
            for (const shipId of shipOptions) {
                shipSelect.append(
                    $('<option />')
                        .attr('value', shipId)
                        .prop('selected', shipId === selectedShipId)
                        .text(shipId),
                );
            }

            const typeSelect = $('<select />').attr('data-id', 'Station Roster Type');
            const enabledTypes = manifests.getEnabledTypes(selectedShipId) ?? [];
            const typeOptions =
                selectedType && !enabledTypes.includes(selectedType) ? [...enabledTypes, selectedType] : enabledTypes;
            typeSelect.prop('disabled', !selectedShipId);
            typeSelect.append($('<option value="">-</option>'));
            for (const type of typeOptions) {
                typeSelect.append(
                    $('<option />')
                        .attr('value', type)
                        .prop('selected', type === selectedType)
                        .text(type),
                );
            }

            shipSelect.on('change', () => {
                const newShipId = String(shipSelect.val() ?? '');
                if (!newShipId) {
                    pendingShipByStation.delete(entry.id);
                    adminDriver.assignStation({ stationId: entry.id, shipId: '', stationType: '' });
                    return;
                }
                pendingShipByStation.set(entry.id, newShipId);
                if (entry.stationType) {
                    // moving an already-typed station (self-assigned, or a prior GM pick) to a
                    // new ship: carry its type over rather than making the GM re-pick it. The
                    // server is the final authority (`GameManager.isValidStationSlot`), so a
                    // type the new ship's manifest doesn't support is just a safe no-op.
                    adminDriver.assignStation({
                        stationId: entry.id,
                        shipId: newShipId,
                        stationType: entry.stationType,
                    });
                } else {
                    // no type yet: widen the type dropdown for the new ship and wait for a pick
                    render();
                }
            });
            typeSelect.on('change', () => {
                const stationType = String(typeSelect.val() ?? '');
                if (selectedShipId && stationType) {
                    adminDriver.assignStation({ stationId: entry.id, shipId: selectedShipId, stationType });
                }
            });

            row.append(shipSelect, typeSelect);
            list.append(row);
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
