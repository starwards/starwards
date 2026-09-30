import { Radar, ShipDriver, radarRangeFromArea } from '@starwards/core';
import { addBareBarBlade, addTextBlade, createWidgetPane } from '../panel';
import { propertyStub, readNumberProp } from '../property-wrappers';

import { EmitterLoop } from '../loop';
import { WidgetContainer } from '../container';

/** Compass bearing in 0..359 degrees, zero-padded to three digits. */
function formatBearing(degrees: number) {
    return `${String(Math.round(((degrees % 360) + 360) % 360) % 360).padStart(3, '0')}°`;
}

/**
 * Read-only readout of the steerable scan beam: where it is commanded to point, how wide it is
 * and how far it reaches. The beam is steered by hotkeys, never by this pane.
 */
export function drawScanBeam(container: WidgetContainer, shipDriver: ShipDriver, beam: Radar, beamPointer: string) {
    const { pane, cleanup } = createWidgetPane(container, 'Scan Beam');
    const bearing = addTextBlade(
        pane,
        readNumberProp(shipDriver, `${beamPointer}/bearingCommand`),
        { label: 'Bearing', format: formatBearing },
        cleanup.add,
    );
    bearing.element.classList.add('sw-big');

    const arc = readNumberProp(shipDriver, `${beamPointer}/arc`);
    addTextBlade(pane, arc, { label: 'Arc', format: (v: number) => `${Math.round(v)}°` }, cleanup.add);
    addBareBarBlade(pane, arc, cleanup.add);

    // the effective range is derived from power, damage and arc rather than synced as a field,
    // so it is sampled; its bar spans up to the reach of the narrowest arc at full effectiveness
    const range = {
        ...propertyStub(beam.range),
        range: [0, radarRangeFromArea(beam.design.area, beam.design.minArc)] as [number, number],
    };
    addTextBlade(pane, range, { label: 'Range', format: (v: number) => `${(v / 1000).toFixed(0)} KM` }, cleanup.add);
    addBareBarBlade(pane, range, cleanup.add);
    const loop = new EmitterLoop(200);
    cleanup.add(() => loop.stop());
    loop.onLoop(() => range.setValue(beam.range));
    loop.start();
}
