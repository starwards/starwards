import $ from 'jquery';
import { AdminDriver } from '@starwards/core';
import { hsl } from '../colors';

/**
 * View-only roster of every registered station (`AdminState.stations`), for the GM to see who's
 * connected and what they're bound to. GM assignment UI lands in a follow-up issue (#2132); this
 * only renders the current registry. Attached directly to `document.body` — not to `#wrapper` —
 * so it survives `runScreenLifecycle`'s wrapper churn and renders even while the game is STOPPED,
 * when stations have already connected but no game (and no `#wrapper` content gated on
 * `Status.GAME_RUNNING`) exists yet.
 */
export function drawStationRoster(adminDriver: AdminDriver): () => void {
    const panel = $('<div />')
        .attr('data-id', 'Station Roster')
        .css({
            position: 'fixed',
            top: '0.5em',
            right: '0.5em',
            zIndex: 2000,
            minWidth: '16em',
            maxWidth: '24em',
            maxHeight: '40vh',
            overflowY: 'auto',
            padding: '0.5em 0.75em',
            fontFamily: 'sans-serif',
            fontSize: '0.8em',
            color: hsl.primary.main(3),
            backgroundColor: 'rgba(10, 10, 10, 0.85)',
            // View-only: never intercept clicks meant for the dashboard underneath it.
            pointerEvents: 'none',
        });
    panel.append($('<div />').text('Stations').css({ fontWeight: 'bold', marginBottom: '0.25em' }));
    const list = $('<div />').attr('data-id', 'Station Roster List');
    panel.append(list);
    $(document.body).append(panel);

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
    return () => {
        adminDriver.events.off('/stations', render);
        adminDriver.events.off('/stations/**', render);
        panel.remove();
    };
}
