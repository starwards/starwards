import { ClientStatus, Status } from '@starwards/core';

import $ from 'jquery';
import { hsl } from '../colors';
import { wrapRootWidgetContainer } from '../container';

export type ScreenContainer = ReturnType<typeof wrapRootWidgetContainer>;
export type ScreenTeardown = (() => void) | void;

function renderStandby(element: JQuery<HTMLElement>, text: string) {
    element.attr('data-id', 'Standby').css({
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: hsl.background,
        color: hsl.primary.main(3),
        fontFamily: 'sans-serif',
        fontSize: '2vw',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
    });
    element.text(text || 'connecting...');
}

/**
 * Drives a single `#wrapper`-rooted screen between a standby view and the live UI, keyed off
 * `ClientStatus`. Every transition replaces `#wrapper` wholesale: a `WidgetContainer`'s 'destroy'
 * event (which radar/tweakpane widgets already hook to release PIXI apps and panes) fires exactly
 * as it would on page unload, just re-run every time instead of only once — so `init` never has
 * to reason about a wrapper that outlives its own screen.
 */
export function runScreenLifecycle(
    statusTracker: ClientStatus,
    threshold: Status,
    init: (wrapperEl: JQuery<HTMLElement>) => Promise<ScreenTeardown>,
): void {
    let wrapperEl = $('#wrapper');
    const parent = wrapperEl.parent();
    let teardown: ScreenTeardown;
    let generation = 0;

    function replaceWrapper(): JQuery<HTMLElement> {
        // empty() first so each sub-container's own 'destroy' (watching #wrapper for its removal)
        // fires; remove() then fires #wrapper's own 'destroy' (watched by its parent).
        wrapperEl.empty().remove();
        const next = $('<div id="wrapper"></div>');
        parent.append(next);
        wrapperEl = next;
        return next;
    }

    statusTracker.onStatusChange(({ status, text }) => {
        const myGeneration = ++generation;
        teardown?.();
        teardown = undefined;
        const freshWrapper = replaceWrapper();
        if (status >= threshold) {
            void init(freshWrapper).then((result) => {
                if (myGeneration === generation) {
                    teardown = result;
                } else {
                    // superseded while initializing — tear down immediately, it was never shown
                    result?.();
                }
            });
        } else {
            renderStandby(freshWrapper, text);
        }
    });
}

/** `runScreenLifecycle` for screens built on `wrapRootWidgetContainer` (the fixed-grid stations). */
export function runStationScreen(
    statusTracker: ClientStatus,
    threshold: Status,
    init: (container: ScreenContainer) => Promise<ScreenTeardown>,
): void {
    runScreenLifecycle(statusTracker, threshold, (wrapperEl) => init(wrapRootWidgetContainer(wrapperEl)));
}
