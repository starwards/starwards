import { AdminDriver, ClientStatus, Driver, Status, createLogger } from '@starwards/core';

import $ from 'jquery';
import { beginStationRegistrationWithRetry } from '../station-identity';
import { hsl } from '../colors';
import { shouldShowGameMessage } from './game-message-overlay';
import { wrapRootWidgetContainer } from '../container';

const { error: logError } = createLogger('screen:station-lifecycle');

/**
 * Registers this browser tab as a station of `stationType` in the server's registry
 * (`AdminState.stations`), requesting `requestedShipId` (typically the page's own `?ship=` url
 * param, or `''`) as its self-assignment. Returns a `ClientStatus` bound to whatever ship the
 * registry currently resolves for this station — which can differ from `requestedShipId`
 * (rejected, or filled in later by auto-assign / a GM reassignment) — so the caller never binds
 * to the raw url param directly.
 */
export function registerStationClient(
    driver: Driver,
    stationType: string,
    requestedShipId: string,
): { statusTracker: ClientStatus; getAssignedShipId: () => Promise<string> } {
    const registration = beginStationRegistrationWithRetry(driver, stationType, requestedShipId);
    return {
        statusTracker: new ClientStatus(driver, registration.getAssignedShipId),
        getAssignedShipId: registration.getAssignedShipId,
    };
}

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
 * Renders the GM's free-text `AdminState.message` (scenario/end-of-game announcements) as a
 * banner over the given screen wrapper, on every station. It sits above the screen content
 * without blocking it, so a paused end-state radar stays visible — and legible as an intentional
 * paused state, not a glitch — behind the message.
 */
function attachGameMessageOverlay(wrapperEl: JQuery<HTMLElement>, adminDriver: AdminDriver): () => void {
    // The overlay's `position: absolute` needs a positioned ancestor to anchor to. #wrapper is
    // `position: relative` in static/styles/index.css today, but that's an assumption this
    // shared lifecycle shouldn't silently depend on — enforce it here instead.
    if (wrapperEl.css('position') === 'static') {
        wrapperEl.css('position', 'relative');
    }
    const overlay = $('<div />')
        .attr('data-id', 'Game Message')
        .css({
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            zIndex: 1000,
            display: 'none',
            padding: '1em',
            textAlign: 'center',
            fontFamily: 'sans-serif',
            fontSize: '2vw',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: hsl.primary.main(3),
            backgroundColor: 'rgba(10, 10, 10, 0.85)',
            pointerEvents: 'none',
        });
    wrapperEl.append(overlay);

    const render = () => {
        const message = adminDriver.state.message;
        overlay.text(message);
        overlay.css('display', shouldShowGameMessage(message) ? 'block' : 'none');
    };
    render();
    adminDriver.events.on('/message', render);
    return () => {
        adminDriver.events.off('/message', render);
        overlay.remove();
    };
}

/**
 * Drives a single `#wrapper`-rooted screen between a standby view and the live UI, keyed off
 * `ClientStatus`. Every transition replaces `#wrapper` wholesale: a `WidgetContainer`'s 'destroy'
 * event (which radar/tweakpane widgets already hook to release PIXI apps and panes) fires exactly
 * as it would on page unload, just re-run every time instead of only once — so `init` never has
 * to reason about a wrapper that outlives its own screen.
 */
export function runScreenLifecycle(
    driver: Driver,
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
            // Two independent async setups (the screen itself, and the message overlay) share one
            // teardown-on-supersession rule: whichever resolves after a newer generation started
            // gets torn down immediately instead of being shown.
            const cleanups: Array<() => void> = [];
            const addCleanup = (fn: ScreenTeardown) => {
                if (myGeneration === generation) {
                    if (fn) cleanups.push(fn);
                } else {
                    fn?.();
                }
            };
            teardown = () => cleanups.splice(0).forEach((fn) => fn());
            void init(freshWrapper).then(addCleanup);
            void driver
                .getAdminDriver()
                .then((adminDriver) => {
                    addCleanup(attachGameMessageOverlay(freshWrapper, adminDriver));
                })
                .catch((err: unknown) => {
                    // Missing the end-of-game banner is a far better failure than an unhandled
                    // rejection on all seven station screens at once.
                    logError('failed to attach game message overlay', err);
                });
        } else {
            renderStandby(freshWrapper, text);
        }
    });
}

/** `runScreenLifecycle` for screens built on `wrapRootWidgetContainer` (the fixed-grid stations). */
export function runStationScreen(
    driver: Driver,
    statusTracker: ClientStatus,
    threshold: Status,
    init: (container: ScreenContainer) => Promise<ScreenTeardown>,
): void {
    runScreenLifecycle(driver, statusTracker, threshold, (wrapperEl) => init(wrapRootWidgetContainer(wrapperEl)));
}
