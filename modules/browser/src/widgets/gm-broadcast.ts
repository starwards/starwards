import $ from 'jquery';
import { AdminDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';
import { hsl } from '../colors';

/**
 * The GM's broadcast blade: type a message, send it to every station through the message queue,
 * and read back the history of everything announced this game (newest first). A regular
 * `DashboardWidget` in the golden-layout grid (see `gm.ts`).
 */
export function gmBroadcastWidget(adminDriver: AdminDriver): DashboardWidget {
    class GmBroadcastComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawGmBroadcast(container, adminDriver);
        }
    }
    return {
        name: 'broadcast',
        type: 'component',
        component: GmBroadcastComponent,
        defaultProps: {},
    };
}

/** The slice of `AdminDriver` the broadcast blade reads and drives. */
export type BroadcastAdmin = Pick<AdminDriver, 'broadcastMessage'> & {
    readonly state: { readonly messageHistory: Iterable<{ readonly seq: number; readonly text: string }> };
    readonly events: Pick<AdminDriver['events'], 'on' | 'off'>;
};

export function drawGmBroadcast(container: WidgetContainer, adminDriver: BroadcastAdmin): void {
    const root = container.getElement();
    root.attr('data-id', 'GM Broadcast').css({
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4em',
        // the gallery shrink-wraps a scene to its content, so the size must not follow the text
        minWidth: '26em',
        padding: '0.5em 0.75em',
        fontFamily: 'sans-serif',
        fontSize: '0.8em',
        color: hsl.primary.main(3),
    });
    const input = $('<input type="text" />')
        .attr({ 'data-id': 'Broadcast Text', placeholder: 'message to every station' })
        .css({ flex: '1', font: 'inherit', minWidth: '0' });
    const send = $('<button type="button" />')
        .attr('data-id', 'Broadcast Send')
        .text('send')
        .css({ font: 'inherit' })
        .prop('disabled', true);
    const history = $('<div />')
        .attr('data-id', 'Broadcast History')
        .css({ flex: '1', overflowY: 'auto', minHeight: '7em' });
    root.append(
        $('<div />').css({ display: 'flex', gap: '0.4em' }).append(input, send),
        $('<div />').text('History').css({ opacity: 0.7 }),
        history,
    );

    const submit = () => {
        const text = String(input.val() ?? '');
        if (text.trim().length === 0) return;
        adminDriver.broadcastMessage(text);
        input.val('').trigger('focus');
        send.prop('disabled', true);
    };
    input.on('input', () => send.prop('disabled', String(input.val() ?? '').trim().length === 0));
    input.on('keydown', (e) => {
        if (e.key === 'Enter') submit();
    });
    send.on('click', submit);

    function render() {
        const entries = [...adminDriver.state.messageHistory].reverse();
        history.empty();
        if (entries.length === 0) {
            history.append($('<div />').attr('data-id', 'Broadcast History Empty').text('no messages yet'));
            return;
        }
        for (const { seq, text } of entries) {
            history.append(
                $('<div />')
                    .attr('data-id', 'Broadcast History Entry')
                    .css({ padding: '0.15em 0', borderBottom: `1px solid ${hsl.primary.main(1)}` })
                    .append($('<span />').text(`#${seq} `).css({ opacity: 0.6 }), $('<span />').text(text)),
            );
        }
    }
    render();
    const paths = ['/messageHistory', '/messageHistory/**'];
    for (const path of paths) {
        adminDriver.events.on(path, render);
    }
    container.on('destroy', () => {
        for (const path of paths) {
            adminDriver.events.off(path, render);
        }
    });
}
