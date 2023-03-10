import * as TweakpaneTablePlugin from 'tweakpane-table';

import { BladeGuiApi, addSliderBlade, addTextBlade, configSliderBlade, configTextBlade, wireBlade } from '../panel';
import { Destructors, PowerLevel, ShipDriver } from '@starwards/core';
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

const totalWidth = 600;
const defectibleWidth = 80;
const systemNameWidth = 130;
export function drawFullSystemsStatus(
    container: WidgetContainer,
    shipDriver: ShipDriver,
    systems = shipDriver.systems
) {
    const panelCleanup = new Destructors();
    const pane = new Pane({ title: 'Full Systems Status', container: container.getElement().get(0) });
    container.getElement().width(`${totalWidth}px`);
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
            { label: 'EPM', width: '60px' },
            { label: 'Heat', width: '60px' },
            { label: 'Coolant', width: '120px' },
        ],
    });
    for (const system of systems) {
        const brokenProp = readProp(shipDriver, `${system.pointer}/broken`);
        const defectiblesProps = system.defectibles.map(defectReadProp(shipDriver));
        const statusChangeProps = [brokenProp, ...defectiblesProps];
        const prop = {
            onChange: (cb: () => unknown) => abstractOnChange(statusChangeProps, system.getStatus, cb),
            getValue: system.getStatus,
        };
        const standardRowApi = pane.addBlade({
            view: 'tableRow',
            label: system.state.name,
        }) as RowApi;

        const statusCell = addTextBlade(standardRowApi.getPane(), prop, { width: '60px' }, panelCleanup.add);
        statusCell.element.classList.add('tp-rotv'); // This allows overriding tweakpane theme for this folder
        const applyThemeByStatus = () => (statusCell.element.dataset.status = system.getStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
        const detachApplyThemeByStatus = abstractOnChange(statusChangeProps, system.getStatus, applyThemeByStatus);
        panelCleanup.add(detachApplyThemeByStatus);

        applyThemeByStatus();
        addTextBlade(
            standardRowApi.getPane(),
            readProp<number>(shipDriver, `${system.pointer}/power`),
            { format: (p: PowerLevel) => PowerLevel[p], width: '60px' },
            panelCleanup.add
        );
        addTextBlade(
            standardRowApi.getPane(),
            readProp<number>(shipDriver, `${system.pointer}/energyPerMinute`),
            { format: (epm: number) => `${Math.round(epm)}`, width: '60px' },
            panelCleanup.add
        );
        addTextBlade(
            standardRowApi.getPane(),
            readProp<number>(shipDriver, `${system.pointer}/heat`),
            { format: (heat: number) => `${Math.round(heat)}`, width: '60px' },
            panelCleanup.add
        );
        addSliderBlade(
            standardRowApi.getPane(),
            readNumberProp(shipDriver, `${system.pointer}/coolantFactor`),
            { format: (c: number) => `${Math.round(c * 100)}%`, width: '120px' },
            panelCleanup.add
        );
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
