import { HackLevel, PowerLevel, ShipDriver } from '@starwards/core';
import { RowApi, plugins as TweakpaneTablePlugin } from 'tweakpane-table';
import { abstractOnChange, aggregate, readNumberProp, readProp } from '../property-wrappers';
import { addBarCellToRow, addTextCellToRow, configTextBlade, createWidgetPane } from '../panel';

import { DashboardWidget } from './dashboard';
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
const defaultDefectibleWidth = 80;
const fitDefectibleWidth = 56;
const defaultSystemNameWidth = 130;
const fitSystemNameWidth = 100;
/** `fit`: take the container's width instead of imposing one, with narrower columns. */
export function drawFullSystemsStatus(
    container: WidgetContainer,
    shipDriver: ShipDriver,
    systems = shipDriver.systems,
    fit = false,
) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Full Systems Status');
    if (!fit) {
        container.getElement().width(`${totalWidth}px`);
    }
    const cell = fit ? '46px' : '60px';
    const coolant = fit ? '80px' : '120px';
    const defectibleWidth = fit ? fitDefectibleWidth : defaultDefectibleWidth;
    const systemNameWidth = fit ? fitSystemNameWidth : defaultSystemNameWidth;
    pane.registerPlugin(TweakpaneTablePlugin);
    pane.addBlade({
        view: 'tableHead',
        label: '',
        headers: [
            { label: 'Status', width: cell },
            { label: 'Power', width: cell },
            { label: 'EPM', width: cell },
            { label: 'Heat', width: cell },
            { label: 'Coolant', width: coolant },
            { label: 'Hacked', width: cell },
        ],
    });
    for (const system of systems) {
        const brokenProp = readProp(shipDriver, `${system.pointer}/broken`);
        const energyStarvedProp = readProp(shipDriver, `${system.pointer}/energyStarved`);
        const defectiblesProps = system.defectibles.map(defectReadProp(shipDriver));
        const statusChangeProps = [brokenProp, energyStarvedProp, ...defectiblesProps];
        const prop = aggregate(statusChangeProps, system.getStatus);
        const standardRowApi = pane.addBlade({
            view: 'tableRow',
            label: system.state.name,
        }) as RowApi;

        const statusCell = addTextCellToRow(standardRowApi, prop, { width: cell }, panelCleanup.add);
        statusCell.element.classList.add('tp-rotv'); // This allows overriding tweakpane theme for this folder
        const applyThemeByStatus = () => (statusCell.element.dataset.status = system.getStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
        const detachApplyThemeByStatus = abstractOnChange(statusChangeProps, system.getStatus, applyThemeByStatus);
        panelCleanup.add(detachApplyThemeByStatus);

        applyThemeByStatus();
        addTextCellToRow(
            standardRowApi,
            readProp<number>(shipDriver, `${system.pointer}/power`),
            { format: (p: PowerLevel) => PowerLevel[p], width: cell },
            panelCleanup.add,
        );
        addTextCellToRow(
            standardRowApi,
            readProp<number>(shipDriver, `${system.pointer}/energyPerMinute`),
            { format: (epm: number) => `${Math.round(epm)}`, width: cell },
            panelCleanup.add,
        );
        addTextCellToRow(
            standardRowApi,
            readProp<number>(shipDriver, `${system.pointer}/heat`),
            { format: (heat: number) => `${Math.round(heat)}`, width: cell },
            panelCleanup.add,
        );
        addBarCellToRow(
            standardRowApi,
            readNumberProp(shipDriver, `${system.pointer}/coolantFactor`),
            { format: (c: number) => `${Math.round(c * 100)}%`, width: coolant },
            panelCleanup.add,
        );
        addTextCellToRow(
            standardRowApi,
            readProp<number>(shipDriver, `${system.pointer}/hacked`),
            { format: (p: HackLevel) => HackLevel[p], width: cell },
            panelCleanup.add,
        );

        const defectiblesRowApi = pane.addBlade({ view: 'tableRow', label: '', cells: [] }) as RowApi;
        for (const d of system.defectibles) {
            const defectibleProp = readNumberProp(shipDriver, `${d.systemPointer}/${d.field}`);
            defectiblesRowApi.addCell({ ...configTextBlade({}, () => d.name), width: `${defectibleWidth}px` });
            addBarCellToRow(defectiblesRowApi, defectibleProp, { width: `${defectibleWidth}px` }, panelCleanup.add);
        }
        pane.addBlade({ view: 'separator' });
    }
    container.getElement().find('.tp-lblv_v').css('min-width', 'fit-content');
    container.getElement().find('.tp-lblv_l').css('min-width', `${systemNameWidth}px`);
}
