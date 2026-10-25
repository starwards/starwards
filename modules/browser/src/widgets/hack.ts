import { HACKABLE_SYSTEM_KEYS, HACK_CANDIDATE_SYSTEMS, ShipDriver, isHackableSystemKey } from '@starwards/core';
import { addBareBarBlade, addButton, addTextBlade, createWidgetPane } from '../panel';
import { propertyStub, readNumberProp, writeProp } from '../property-wrappers';

import { WidgetContainer } from '../container';

/** Hotkey that starts a hack on each hackable system, in `HACKABLE_SYSTEM_KEYS` order. */
export const HACK_HOTKEYS: Record<(typeof HACKABLE_SYSTEM_KEYS)[number], string> = {
    thrusters: 'h',
    chainGuns: 'g',
    smartPilot: 'j',
};

/** Starts a hack on the marked target's `system`; '' cancels the running hack. */
export function startHack(shipDriver: ShipDriver, system: string) {
    writeProp(shipDriver, '/signals/hackSystem').setValue(system);
}

function hackStatus(shipDriver: ShipDriver): string {
    const { hackSystem, hackRefusal } = shipDriver.state.signals;
    if (hackSystem) {
        return `HACKING ${hackSystem}`;
    }
    return hackRefusal ? `FAILED: ${hackRefusal}` : 'IDLE';
}

/**
 * The signals station's hack pane (beam hacking, M4.76): pick a system on the marked target while
 * holding its FULL scan, watch the progress bar fill, and cancel. Systems that cannot be hacked
 * are listed as such.
 */
export function drawHack(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Hack');

    const status = propertyStub(hackStatus(shipDriver));
    addTextBlade(pane, status, { label: 'Hack' }, cleanup.add).element.classList.add('sw-mode');
    addBareBarBlade(pane, readNumberProp(shipDriver, '/signals/hackProgress'), cleanup.add);

    for (const system of HACK_CANDIDATE_SYSTEMS) {
        if (isHackableSystemKey(system)) {
            addButton(
                pane,
                () => startHack(shipDriver, system),
                { label: '', title: `Hack ${system} [${HACK_HOTKEYS[system].toUpperCase()}]` },
                cleanup.add,
            );
        } else {
            addTextBlade(pane, propertyStub('N/A'), { label: system }, cleanup.add);
        }
    }
    addButton(pane, () => startHack(shipDriver, ''), { label: '', title: 'Cancel Hack [C]' }, cleanup.add);

    const refresh = () => {
        status.setValue(hackStatus(shipDriver));
    };
    const pointers = ['/signals/hackSystem', '/signals/hackRefusal'];
    for (const pointer of pointers) {
        shipDriver.events.on(pointer, refresh);
    }
    cleanup.add(() => {
        for (const pointer of pointers) {
            shipDriver.events.off(pointer, refresh);
        }
    });
    refresh();
}
