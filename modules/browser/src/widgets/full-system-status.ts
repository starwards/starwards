import * as TweakpaneTablePlugin from 'tweakpane-table';

import { BladeGuiApi, configTextBlade, wireBlade } from '../panel';
import { Destructors, ShipDriver } from '@starwards/core';
import { abstractOnChange, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { RowApi } from 'tweakpane-table';
import { WidgetContainer } from '../container';
import { defectReadProp } from '../react/hooks';

export function fullSystemsStatusWidget(shipDriver: ShipDriver): DashboardWidget {
    class SystemsStatus {
        constructor(container: WidgetContainer, _: unknown) {
            drawFullSystemsStatus(container, shipDriver);
        }
    }

    return {
        name: 'systems status',
        type: 'component',
        component: SystemsStatus,
        defaultProps: {},
    };
}

export function drawFullSystemsStatus(
    container: WidgetContainer,
    shipDriver: ShipDriver,
    systems = shipDriver.systems
) {
    const panelCleanup = new Destructors();
    const pane = new Pane({ title: 'Full Systems Status', container: container.getElement().get(0) });
    pane.registerPlugin(TweakpaneTablePlugin);
    panelCleanup.add(() => {
        pane.dispose();
    });
    container.on('destroy', panelCleanup.destroy);
    pane.addBlade({
        view: 'tableHead',
        label: '',
        headers: [{ label: 'Status', width: '160px' }],
    });
    for (const system of systems) {
        const brokenProp = readProp(shipDriver, `${system.pointer}/broken`);
        const defectibleProps = [brokenProp, ...system.defectibles.map(defectReadProp(shipDriver))];
        const getText = () => system.getStatus();
        const prop = {
            onChange: (cb: () => unknown) => abstractOnChange(defectibleProps, getText, cb),
            getValue: getText,
        };
        const rowApi = pane.addBlade({
            view: 'tableRow',
            label: system.state.name,
            cells: [{ ...configTextBlade({}, getText), width: '160px' }],
        }) as RowApi;

        const statusCell = rowApi.getCell(0) as unknown as BladeGuiApi<string>;
        wireBlade(statusCell, prop, panelCleanup.add);
        statusCell.element.classList.add('tp-rotv'); // This allows overriding tweakpane theme for this folder
        const applyThemeByStatus = () => (statusCell.element.dataset.status = system.getStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
        panelCleanup.add(abstractOnChange(defectibleProps, system.getStatus, applyThemeByStatus));
        applyThemeByStatus();
    }
}
