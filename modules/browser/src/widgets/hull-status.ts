import { CapsuleTier, Destructors, HullStatus } from '@starwards/core';
import { addTextBlade, createWidgetPane } from '../panel';

import { EmitterLoop } from '../loop';
import { WidgetContainer } from '../container';
import { propertyStub } from '../property-wrappers';

/** How each capsule tier lights its row (tweakpane.css `data-status`). */
const tierStatus: Record<CapsuleTier, 'OK' | 'WARN' | 'ERROR'> = {
    intact: 'OK',
    damaged: 'WARN',
    critical: 'ERROR',
    failing: 'ERROR',
};

/** A row's readout: hull percent and capsule tier, and a snapshot's age. */
function hullStatusText(r: HullStatus): string {
    if (r.intel === 'PENDING' || r.capsule === undefined) return '—';
    const age = r.intel === 'SNAPSHOT' ? ` ${Math.round(r.ageSeconds ?? 0)}S` : '';
    return `${r.hullPercent ?? 0}% ${r.capsule.toUpperCase()}${age}`;
}

/**
 * The Signals hull-status list (SPEC-0010): one row per ally and per ship scanned to SNAPSHOT or
 * FULL, as `rows` reads them (core `hullStatusList`), lit by capsule tier. Rows are rebuilt when the
 * set of subjects changes and updated in place otherwise.
 */
export function drawHullStatus(container: WidgetContainer, rows: () => HullStatus[]) {
    const { pane, cleanup } = createWidgetPane(container, 'Hull Status');
    let session = new Destructors();
    cleanup.add(() => session.destroy());
    let signature: string | undefined;
    let models: { text: ReturnType<typeof propertyStub<string>>; element: HTMLElement }[] = [];

    const update = () => {
        const current = rows();
        const next = current.map((r) => `${r.allied ? 'A' : 'C'}${r.id}:${r.name}`).join(',');
        if (next !== signature) {
            signature = next;
            session.destroy();
            session = new Destructors();
            models = current.map((r) => {
                const text = propertyStub('—');
                const blade = addTextBlade(
                    pane,
                    text,
                    { label: `${r.allied ? 'ALLY' : 'TGT'} ${r.name}` },
                    session.add,
                );
                blade.element.classList.add('tp-rotv', 'readout', 'sw-mode');
                return { text, element: blade.element };
            });
            if (!current.length) {
                addTextBlade(pane, propertyStub('NO CONTACTS'), { label: '' }, session.add);
            }
        }
        current.forEach((r, i) => {
            models[i].text.setValue(hullStatusText(r));
            models[i].element.dataset.status = r.capsule ? tierStatus[r.capsule] : '';
        });
    };
    const loop = new EmitterLoop(200);
    cleanup.add(() => loop.stop());
    loop.onLoop(update);
    loop.start();
    update();
}
