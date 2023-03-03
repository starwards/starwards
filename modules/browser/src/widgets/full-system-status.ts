import * as TweakpaneTablePlugin from 'tweakpane-table';

import { BladeGuiApi, configSliderBlade, configTextBlade, wireBlade } from '../panel';
import { Destructors, ShipDriver } from '@starwards/core';
import { abstractOnChange, readNumberProp, readProp } from '../property-wrappers';

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

const defectibleWidth = 80;
const systemNameWidth = 130;
export function drawFullSystemsStatus(
    container: WidgetContainer,
    shipDriver: ShipDriver,
    systems = shipDriver.systems
) {
    const panelCleanup = new Destructors();
    const pane = new Pane({ title: 'Full Systems Status', container: container.getElement().get(0) });
    const maxDefectibles = Math.max(...systems.map((sys) => sys.defectibles.length));
    container.getElement().width(`500px`);
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
            { label: '', width: `${maxDefectibles * 120}px` },
        ],
    });
    for (const system of systems) {
        const brokenProp = readProp(shipDriver, `${system.pointer}/broken`);
        const defectiblesProps = system.defectibles.map(defectReadProp(shipDriver));
        const statusChangeProps = [brokenProp, ...defectiblesProps];
        const getText = () => system.getStatus();
        const prop = {
            onChange: (cb: () => unknown) => abstractOnChange(statusChangeProps, getText, cb),
            getValue: getText,
        };
        const standardRowApi = pane.addBlade({
            view: 'tableRow',
            label: system.state.name,
            cells: [
                { ...configTextBlade({}, getText), width: '60px' },
                { ...configTextBlade({}, () => ''), width: `${maxDefectibles * defectibleWidth * 2 - 60}px` },
            ],
        }) as RowApi;

        const statusCell = standardRowApi.getCell(0) as unknown as BladeGuiApi<string>;
        wireBlade(statusCell, prop, panelCleanup.add);
        statusCell.element.classList.add('tp-rotv'); // This allows overriding tweakpane theme for this folder
        const applyThemeByStatus = () => (statusCell.element.dataset.status = system.getStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
        panelCleanup.add(abstractOnChange(statusChangeProps, system.getStatus, applyThemeByStatus));
        applyThemeByStatus();
        const defectiblesRowApi = pane.addBlade({ view: 'tableRow', label: '', cells: [] }) as RowApi;
        for (const d of system.defectibles) {
            const defectibleProp = readNumberProp(shipDriver, `${d.systemPointer}/${d.field}`);
            defectiblesRowApi
                .getPane()
                .addBlade({ ...configTextBlade({}, () => d.name), width: `${defectibleWidth}px` });
            const valueBlade = defectiblesRowApi.getPane().addBlade({
                ...configSliderBlade({}, defectibleProp.range, defectibleProp.getValue),
                width: `${defectibleWidth}px`,
            }) as unknown as BladeGuiApi<number>;
            wireBlade(valueBlade, defectibleProp, panelCleanup.add);
        }
        pane.addSeparator();
    }
    container.getElement().find('.tp-lblv_v').css('min-width', 'fit-content');
    container.getElement().find('.tp-lblv_l').css('min-width', `${systemNameWidth}px`);
}
