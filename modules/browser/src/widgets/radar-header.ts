import $ from 'jquery';
import { WidgetContainer } from '../container';

/**
 * A caption strip above a station's radar: what the radar shows on the left, whose it is on the
 * right. Display-only text; styled by `.sw-radar-header` in tweakpane.css.
 */
export function drawRadarHeader(container: WidgetContainer, left: string, right: string) {
    const header = $('<div class="sw-radar-header" />').append($('<span />').text(left), $('<span />').text(right));
    container.getElement().append(header);
    container.on('destroy', () => header.remove());
}
