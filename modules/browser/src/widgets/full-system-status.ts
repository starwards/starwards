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
const fitDefectibleWidth = 32;
const defaultSystemNameWidth = 130;
const fitSystemNameWidth = 112;
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
    const cell = fit ? '30px' : '60px';
    const powerWidth = fit ? '38px' : '60px';
    const coolant = fit ? '56px' : '120px';
    const defectibleWidth = fit ? fitDefectibleWidth : defaultDefectibleWidth;
    const systemNameWidth = fit ? fitSystemNameWidth : defaultSystemNameWidth;
    const maxDefectibles = Math.max(0, ...systems.map((s) => s.defectibles.length));
    pane.registerPlugin(TweakpaneTablePlugin);
    pane.addBlade({
        view: 'tableHead',
        label: '',
        headers: [
            { label: fit ? 'Stat' : 'Status', width: cell },
            { label: fit ? 'Pwr' : 'Power', width: powerWidth },
            ...(fit ? [] : [{ label: 'EPM', width: cell }]),
            { label: 'Heat', width: cell },
            { label: fit ? 'Cool' : 'Coolant', width: coolant },
            { label: fit ? 'Hack' : 'Hacked', width: cell },
            ...(fit ? [{ label: 'Defects', width: `${defectibleWidth * maxDefectibles}px` }] : []),
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
            {
                format: (p: PowerLevel) => (fit ? fitPowerLabel(p) : PowerLevel[p]),
                width: powerWidth,
            },
            panelCleanup.add,
        );
        if (!fit) {
            addTextCellToRow(
                standardRowApi,
                readProp<number>(shipDriver, `${system.pointer}/energyPerMinute`),
                { format: (epm: number) => `${Math.round(epm)}`, width: cell },
                panelCleanup.add,
            );
        }
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
            { format: (p: HackLevel) => (fit && p === HackLevel.OK ? '' : HackLevel[p]), width: cell },
            panelCleanup.add,
        );

        if (fit) {
            for (const d of system.defectibles) {
                const defectibleProp = readNumberProp(shipDriver, `${d.systemPointer}/${d.field}`);
                const bar = addBarCellToRow(
                    standardRowApi,
                    defectibleProp,
                    { width: `${defectibleWidth}px` },
                    panelCleanup.add,
                );
                bar.element.title = d.name;
            }
            // keep the columns aligned when this system has fewer defects than the widest row
            for (let i = system.defectibles.length; i < maxDefectibles; i++) {
                standardRowApi.addCell({ ...configTextBlade({}, () => ''), width: `${defectibleWidth}px` });
            }
            continue;
        }
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

/** Normal power is the expected state, so it reads as an empty (dark) cell; only departures are spelled out. */
function fitPowerLabel(p: PowerLevel) {
    if (p === PowerLevel.NORMAL) return '';
    return p === PowerLevel.SHUTDOWN ? 'OFF' : PowerLevel[p];
}
