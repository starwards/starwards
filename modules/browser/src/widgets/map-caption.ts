import $ from 'jquery';
import { CameraView } from '../radar/camera-view';
import { WidgetContainer } from '../container';

/**
 * A non-interactive caption over a radar's bottom-left corner: what one grid cell measures at
 * the current zoom, and whose radar it is. Styled by `.sw-map-caption` in tweakpane.css.
 */
export function drawMapCaption(container: WidgetContainer, view: CameraView, cellSize: () => number, shipId: string) {
    const caption = $('<div class="sw-map-caption" />');
    const update = () => caption.text(`DRADIS · 1 CELL = ${formatKm(cellSize())} KM · SHIP ${shipId}`);
    update();
    container.getElement().css('pointer-events', 'none').append(caption);
    view.events.on('screenChanged', update);
    container.on('destroy', () => {
        view.events.off('screenChanged', update);
        caption.remove();
    });
}

function formatKm(meters: number) {
    const km = meters / 1000;
    return Number.isInteger(km) ? `${km}` : `${Number(km.toPrecision(2))}`;
}
