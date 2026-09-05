import $ from 'jquery';
import { AdminDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';
import { hsl } from '../colors';

/**
 * View-only roster of every registered station (`AdminState.stations`), for the GM to see who's
 * connected and what they're bound to. GM assignment UI lands in a follow-up issue (#2132); this
 * only renders the current registry. A regular `DashboardWidget` living in the golden-layout
 * grid (see `gm.ts`) — never a floating overlay, which would sit on top of other widgets and eat
 * their clicks. Accepted consequence: like every other widget here, it only renders once the
 * screen passes `Status.GAME_RUNNING` — a STOPPED-state view isn't required for #2131 (the lobby
 * already shows a station's own identity; #2132 can revisit).
 */
export function stationRosterWidget(adminDriver: AdminDriver): DashboardWidget {
    class StationRosterComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawStationRoster(container, adminDriver);
        }
    }
    return {
        name: 'station roster',
        type: 'component',
        component: StationRosterComponent,
        defaultProps: {},
    };
}

function drawStationRoster(container: WidgetContainer, adminDriver: AdminDriver): void {
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

    const render = () => {
        list.empty();
        for (const entry of adminDriver.state.stations.values()) {
            list.append(
                $('<div />')
                    .attr('data-id', `Station Roster Row ${entry.id}`)
                    .text(
                        `${entry.connected ? '●' : '○'} ${entry.id} — ${entry.stationType || 'unassigned'} → ${
                            entry.shipId || 'standby'
                        }`,
                    ),
            );
        }
    };
    render();
    adminDriver.events.on('/stations', render);
    adminDriver.events.on('/stations/**', render);
    container.on('destroy', () => {
        adminDriver.events.off('/stations', render);
        adminDriver.events.off('/stations/**', render);
    });
}
