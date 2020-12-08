import {
    ParsedGamepadId,
    getGamepads,
    Gamepad,
    tryRemapStdLayout,
    parseGamepadId,
    poll,
    metadata,
} from '@maulingmonkey/gamepad/modular';

import { select, Selection, BaseType } from 'd3-selection';

/* Copyright 2017 MaulingMonkey

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

const axises = 11;
const buttons = 38;

interface Entry {
    original: Gamepad;
    display: Gamepad;
    parsedIds: ParsedGamepadId;
}

function getEntries(): Entry[] {
    const deadZone = (<HTMLInputElement>document.getElementById('deadzone')).checked ? 0.15 : 0;
    const standardize = (<HTMLInputElement>document.getElementById('standardize')).checked;
    const keepNonstandard = (<HTMLInputElement>document.getElementById('keep-nonstd')).checked;
    const keepInactive = (<HTMLInputElement>document.getElementById('keep-inactive')).checked;

    return getGamepads({ deadZone, standardize, keepNonstandard, keepInactive, keepNull: false }).map((gp) => {
        return {
            original: gp,
            display: standardize ? tryRemapStdLayout(gp) : gp,
            parsedIds: parseGamepadId(gp.id),
        };
    });
}

function gamepadAxisText(gamepad: Gamepad, axisIndex: number): string {
    const axis = gamepad.axes[axisIndex];
    if (axis === undefined) return '';
    return (axis >= 0 ? '+' : '') + axis.toFixed(2);
}

function gamepadButtonText(gamepad: Gamepad, buttonIndex: number): string {
    const button = gamepad.buttons[buttonIndex];
    if (button === undefined) return '';
    return button.value.toFixed(2);
}

function gamepadAxisFill(gamepad: Gamepad, axisIndex: number): string {
    const axis = gamepad.axes[axisIndex];
    if (axis === undefined) return '';
    let v = 255 * Math.abs(axis);
    if (v > 255) v = 255;
    v = 255 - Math.round(v);
    let c = v.toString(16);
    if (c.length === 1) c = '0' + c;

    return axis > 0 ? '#' + c + 'FFFF' : '#FF' + c + c;
}

function gamepadButtonFill(gamepad: Gamepad, buttonIndex: number): string {
    const button = gamepad.buttons[buttonIndex];
    if (button === undefined) return '';
    let v = 255 * (0.1 + 0.9 * Math.abs(button.value));
    if (v > 255) v = 255;
    v = 255 - Math.round(v);
    let c = v.toString(16);
    if (c.length === 1) c = '0' + c;

    return !button.pressed ? '#' + c + 'FFFF' : '#FF' + c + c;
}

function refreshGamepads() {
    const entries = getEntries();

    let rows = select('#mmk-gamepad-metadata-1-demo').selectAll('.gamepad').data(entries);
    rows.exit().remove();
    let newRows = rows.enter().append('tr').attr('class', 'gamepad');
    newRows.append('td').attr('class', 'gamepad-name');
    newRows.append('td').attr('class', 'gamepad-index');
    newRows.append('td').attr('class', 'gamepad-mapping');
    newRows.append('td').attr('class', 'gamepad-connected');
    newRows.append('td').attr('class', 'gamepad-label');
    newRows.append('td').attr('class', 'gamepad-vendor');
    newRows.append('td').attr('class', 'gamepad-product');
    newRows.append('td').attr('class', 'gamepad-hint');
    for (let i = 0; i < axises; ++i) newRows.append('td').attr('class', `gamepad-axis-${i}`);
    updateRows(rows);

    rows = select('#mmk-gamepad-metadata-2-demo').selectAll('.gamepad').data(entries);
    rows.exit().remove();
    newRows = rows.enter().append('tr').attr('class', 'gamepad');
    newRows.append('td').attr('class', 'gamepad-name');
    newRows.append('td').attr('class', 'gamepad-index');
    for (let i = 0; i < buttons; ++i) newRows.append('td').attr('class', `gamepad-button-${i}`);
    updateRows(rows);
}

function updateRows(rows: Selection<BaseType, Entry, BaseType, unknown>) {
    rows.select('.gamepad-name').text((gp) => gp.parsedIds.name);
    rows.select('.gamepad-index').text((gp) => gp.display.index);
    rows.select('.gamepad-mapping').text((gp) => gp.display.mapping);
    rows.select('.gamepad-connected').text((gp) => (gp.display.connected ? 'true' : 'false'));
    rows.select('.gamepad-label').text((gp) => metadata.getDeviceLabel(gp.display));
    rows.select('.gamepad-vendor').text((gp) => gp.parsedIds.vendor || 'N/A');
    rows.select('.gamepad-product').text((gp) => gp.parsedIds.product || 'N/A');
    rows.select('.gamepad-hint').text((gp) => gp.parsedIds.hint || 'N/A');

    for (let i = 0; i < axises; ++i) {
        rows.select(`.gamepad-axis-${i}`)
            .style('background-color', (gp) => gamepadAxisFill(gp.display, i))
            .text((gp) => gamepadAxisText(gp.display, i));
    }

    for (let i = 0; i < buttons; ++i) {
        rows.select(`.gamepad-button-${i}`)
            .style('background-color', (gp) => gamepadButtonFill(gp.display, i))
            .text((gp) => gamepadButtonText(gp.display, i));
    }
}

interface DemoEventRow {
    type: string;
    gamepadIndex: string;
    index?: string;
    held?: string;
    value?: string;
    valueLabel?: string;
}

let eventRows: DemoEventRow[] = [];

function endsWith(left: string, right: string) {
    return left.length >= right.length && left.substr(left.length - right.length) === right;
}

function refreshEvents() {
    const keepButtonValueEvents = (<HTMLInputElement>document.getElementById('keep-button-value-events')).checked;
    const keepNearZeroEvents = (<HTMLInputElement>document.getElementById('keep-zero-events')).checked;
    eventRows = eventRows.filter((row) => {
        if (!keepButtonValueEvents && endsWith(row.type, '-button-value')) return false;
        if (!keepNearZeroEvents && Math.abs(parseFloat(row.value || '1')) < 0.1) return false;
        return true;
    });
    while (eventRows.length > 20) eventRows.shift();

    const d3entries = select('#mmk-gamepad-events-demo').selectAll('.event').data(eventRows);

    const d3new = d3entries.enter().append('tr').attr('class', 'event');
    d3new.append('td').attr('class', 'event-type');
    d3new.append('td').attr('class', 'event-gamepad-index');
    d3new.append('td').attr('class', 'event-index');
    d3new.append('td').attr('class', 'event-held');
    d3new.append('td').attr('class', 'event-value');
    d3new.append('td').attr('class', 'event-value-label');

    d3entries.exit().remove();

    d3entries.select('.event-type').text((e) => e.type);
    d3entries.select('.event-gamepad-index').text((e) => e.gamepadIndex);
    d3entries.select('.event-index').text((e) => e.index || '');
    d3entries.select('.event-held').text((e) => e.held || '');
    d3entries.select('.event-value').text((e) => e.value || '');
    d3entries.select('.event-value-label').text((e) => e.valueLabel || '');
}

function refresh() {
    refreshGamepads();
    refreshEvents();
}

addEventListener('load', function () {
    refresh();
    poll(refresh);
    if ('addEventListener' in window) {
        addEventListener('mmk-gamepad-connected', (e) =>
            eventRows.push({
                type: e.type,
                gamepadIndex: e.gamepadIndex.toString(),
                value: e.connected ? 'connected' : 'disconnected',
            })
        );
        addEventListener('mmk-gamepad-disconnected', (e) =>
            eventRows.push({
                type: e.type,
                gamepadIndex: e.gamepadIndex.toString(),
                value: e.connected ? 'connected' : 'disconnected',
            })
        );
        addEventListener('mmk-gamepad-button-down', (e) =>
            eventRows.push({
                type: e.type,
                gamepadIndex: e.gamepadIndex.toString(),
                index: e.buttonIndex.toString(),
                held: e.held ? 'held' : 'released',
                value: e.buttonValue.toFixed(2),
                valueLabel: metadata.getGamepadButtonLabel(e.gamepadType, e.buttonIndex),
            })
        );
        addEventListener('mmk-gamepad-button-up', (e) =>
            eventRows.push({
                type: e.type,
                gamepadIndex: e.gamepadIndex.toString(),
                index: e.buttonIndex.toString(),
                held: e.held ? 'held' : 'released',
                value: e.buttonValue.toFixed(2),
                valueLabel: metadata.getGamepadButtonLabel(e.gamepadType, e.buttonIndex),
            })
        );
        addEventListener('mmk-gamepad-button-value', (e) =>
            eventRows.push({
                type: e.type,
                gamepadIndex: e.gamepadIndex.toString(),
                index: e.buttonIndex.toString(),
                held: e.held ? 'held' : 'released',
                value: e.buttonValue.toFixed(2),
                valueLabel: metadata.getGamepadButtonLabel(e.gamepadType, e.buttonIndex),
            })
        );
        addEventListener('mmk-gamepad-axis-value', (e) =>
            eventRows.push({
                type: e.type,
                gamepadIndex: e.gamepadIndex.toString(),
                index: e.axisIndex.toString(),
                value: e.axisValue.toFixed(2),
                valueLabel: metadata.getGamepadAxisLabel(e.gamepadType, e.axisIndex),
            })
        );
    }
});
