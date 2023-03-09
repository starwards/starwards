import * as TweakpaneTablePlugin from 'tweakpane-table';

import { Destructors, PowerLevel, ShipDriver } from '@starwards/core';
import { abstractOnChange, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { RowApi } from 'tweakpane-table';
import { WidgetContainer } from '../container';
import { addTextBlade } from '../panel';
import { defectReadProp } from '../react/hooks';

export function systemsStatusWidget(shipDriver: ShipDriver): DashboardWidget {
    class SystemsStatus {
        constructor(container: WidgetContainer, _: unknown) {
            drawSystemsStatus(container, shipDriver);
        }
    }

    return {
        name: 'systems status',
        type: 'component',
        component: SystemsStatus,
        defaultProps: {},
    };
}

export function drawSystemsStatus(container: WidgetContainer, shipDriver: ShipDriver, systems = shipDriver.systems) {
    const panelCleanup = new Destructors();
    const pane = new Pane({ title: 'Systems Status', container: container.getElement().get(0) });
    pane.registerPlugin(TweakpaneTablePlugin);
    panelCleanup.add(() => {
        pane.dispose();
    });
    container.on('destroy', panelCleanup.destroy);
    pane.addBlade({
        view: 'tableHead',
        label: '',
        headers: [
            { label: 'Status', width: '60px' },
            { label: 'Power', width: '60px' },
            { label: 'Heat', width: '60px' },
        ],
    });
    for (const system of systems) {
        const standardRowApi = pane.addBlade({
            view: 'tableRow',
            label: system.state.name,
        }) as RowApi;

        const brokenProp = readProp(shipDriver, `${system.pointer}/broken`);
        const defectibleProps = [brokenProp, ...system.defectibles.map(defectReadProp(shipDriver))];
        const statusProp = {
            onChange: (cb: () => unknown) => abstractOnChange(defectibleProps, system.getStatus, cb),
            getValue: system.getStatus,
        };
        const statusBlade = addTextBlade(standardRowApi.getPane(), statusProp, { width: '60px' }, panelCleanup.add);
        statusBlade.element.classList.add('status', 'tp-rotv'); // This allows overriding tweakpane theme for this folder
        const applyThemeToStatus = () => (statusBlade.element.dataset.status = system.getStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
        panelCleanup.add(statusProp.onChange(applyThemeToStatus));
        applyThemeToStatus();

        const powerBlade = addTextBlade(
            standardRowApi.getPane(),
            readProp<number>(shipDriver, `${system.pointer}/power`),
            { format: (p: PowerLevel) => PowerLevel[p], width: '60px' },
            panelCleanup.add
        );
        powerBlade.element.classList.add('status', 'tp-rotv'); // This allows overriding tweakpane theme for this folder
        const powerStatusColor = {
            [PowerLevel.MAX]: 'OK',
            [PowerLevel.HIGH]: 'OK',
            [PowerLevel.MID]: 'WARN',
            [PowerLevel.LOW]: 'WARN',
            [PowerLevel.SHUTDOWN]: 'ERROR',
        } as const;
        const applyThemeToPower = () => (powerBlade.element.dataset.status = powerStatusColor[system.state.power]); // this will change tweakpane theme for this folder, see tweakpane.css
        panelCleanup.add(statusProp.onChange(applyThemeToPower));
        applyThemeToPower();

        const heatProp = {
            onChange: (cb: () => unknown) =>
                abstractOnChange([readProp<number>(shipDriver, `${system.pointer}/heat`)], system.getHeatStatus, cb),
            getValue: system.getHeatStatus,
        };
        const heatBlade = addTextBlade(standardRowApi.getPane(), heatProp, { width: '60px' }, panelCleanup.add);
        heatBlade.element.classList.add('heat', 'tp-rotv'); // This allows overriding tweakpane theme for this folder
        const applyThemeToHeat = () => (heatBlade.element.dataset.status = system.getHeatStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
        panelCleanup.add(heatProp.onChange(applyThemeToHeat));
        applyThemeToHeat();
    }
}
