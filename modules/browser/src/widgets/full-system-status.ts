import { Destructor, HackLevel, PowerLevel, ShipDriver } from '@starwards/core';
import { RowApi, plugins as TweakpaneTablePlugin } from 'tweakpane-table';
import { abstractOnChange, aggregate, readNumberProp, readProp } from '../property-wrappers';
import { addBarCellToRow, addTextCellToRow, configTextBlade, createWidgetPane } from '../panel';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
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
const defaultSystemNameWidth = 130;
const fitSystemNameWidth = 112;
const fitDefectBarWidth = 40;
const fitDefectLabelWidth = 52;

const defaultWidths = { status: '60px', power: '60px', epm: '60px', heat: '60px', coolant: '120px', hacked: '60px' };
const fitWidths = { status: '30px', power: '38px', epm: '34px', heat: '30px', coolant: '56px', hacked: '30px' };

/** Three letters per word for one or two words, initials for longer names: short enough to never truncate. */
function abbreviateDefect(name: string) {
    const words = name.split(' ').filter((w) => w !== 'of');
    return words.length > 2 ? words.map((w) => w[0]).join('') : words.map((w) => w.slice(0, 3)).join(' ');
}

/**
 * `fit`: take the container's width instead of imposing one, and fold each system into a status row
 * plus, when it has defects, one short line of labelled defect bars.
 */
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
    const w = fit ? fitWidths : defaultWidths;
    const defectibleWidth = `${defaultDefectibleWidth}px`;
    const systemNameWidth = fit ? fitSystemNameWidth : defaultSystemNameWidth;
    pane.registerPlugin(TweakpaneTablePlugin);
    pane.addBlade({
        view: 'tableHead',
        label: '',
        headers: [
            { label: fit ? 'Stat' : 'Status', width: w.status },
            { label: fit ? 'Pwr' : 'Power', width: w.power },
            { label: 'EPM', width: w.epm },
            { label: 'Heat', width: w.heat },
            { label: fit ? 'Cool' : 'Coolant', width: w.coolant },
            { label: fit ? 'Hack' : 'Hacked', width: w.hacked },
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

        const statusCell = addTextCellToRow(standardRowApi, prop, { width: w.status }, panelCleanup.add);
        statusCell.element.classList.add('tp-rotv'); // This allows overriding tweakpane theme for this folder
        const applyThemeByStatus = () => (statusCell.element.dataset.status = system.getStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
        const detachApplyThemeByStatus = abstractOnChange(statusChangeProps, system.getStatus, applyThemeByStatus);
        panelCleanup.add(detachApplyThemeByStatus);

        applyThemeByStatus();
        addTextCellToRow(
            standardRowApi,
            readProp<number>(shipDriver, `${system.pointer}/power`),
            { format: (p: PowerLevel) => (fit ? fitPowerLabel(p) : PowerLevel[p]), width: w.power },
            panelCleanup.add,
        );
        addTextCellToRow(
            standardRowApi,
            readProp<number>(shipDriver, `${system.pointer}/energyPerMinute`),
            { format: (epm: number) => `${Math.round(epm)}`, width: w.epm },
            panelCleanup.add,
        );
        addTextCellToRow(
            standardRowApi,
            readProp<number>(shipDriver, `${system.pointer}/heat`),
            { format: (heat: number) => `${Math.round(heat)}`, width: w.heat },
            panelCleanup.add,
        );
        addBarCellToRow(
            standardRowApi,
            readNumberProp(shipDriver, `${system.pointer}/coolantFactor`),
            { format: (c: number) => `${Math.round(c * 100)}%`, width: w.coolant },
            panelCleanup.add,
        );
        addTextCellToRow(
            standardRowApi,
            readProp<number>(shipDriver, `${system.pointer}/hacked`),
            { format: (p: HackLevel) => (fit && p === HackLevel.OK ? '' : HackLevel[p]), width: w.hacked },
            panelCleanup.add,
        );

        if (fit) {
            addFitDefectRow(pane, shipDriver, system, panelCleanup.add);
            continue;
        }
        const defectiblesRowApi = pane.addBlade({ view: 'tableRow', label: '', cells: [] }) as RowApi;
        for (const d of system.defectibles) {
            const defectibleProp = readNumberProp(shipDriver, `${d.systemPointer}/${d.field}`);
            defectiblesRowApi.addCell({ ...configTextBlade({}, () => d.name), width: defectibleWidth });
            addBarCellToRow(defectiblesRowApi, defectibleProp, { width: defectibleWidth }, panelCleanup.add);
        }
        pane.addBlade({ view: 'separator' });
    }
    container.getElement().find('.tp-lblv_v').css('min-width', 'fit-content');
    container.getElement().find('.tp-lblv_l').css('min-width', `${systemNameWidth}px`);
}

/** One line under a system: its first defect names the row, the rest follow as label + bar pairs. */
function addFitDefectRow(
    pane: Pane,
    shipDriver: ShipDriver,
    system: ShipDriver['systems'][number],
    cleanup: (d: Destructor) => void,
) {
    if (system.defectibles.length === 0) {
        return;
    }
    const row = pane.addBlade({ view: 'tableRow', label: '', cells: [] }) as RowApi;
    row.element.classList.add('sw-defect-row');
    system.defectibles.forEach((d, index) => {
        const label = abbreviateDefect(d.name);
        if (index === 0) {
            row.element.querySelector('.tp-lblv_l')?.replaceChildren(label);
        } else {
            const labelCell = row.addCell({ ...configTextBlade({}, () => label), width: `${fitDefectLabelWidth}px` });
            labelCell.element.classList.add('sw-defect-label');
        }
        const bar = addBarCellToRow(
            row,
            readNumberProp(shipDriver, `${d.systemPointer}/${d.field}`),
            { width: `${fitDefectBarWidth}px` },
            cleanup,
        );
        bar.element.title = d.name;
    });
}

/** Normal power is the expected state, so it reads as an empty (dark) cell; only departures are spelled out. */
function fitPowerLabel(p: PowerLevel) {
    if (p === PowerLevel.NORMAL) return '';
    return p === PowerLevel.SHUTDOWN ? 'OFF' : PowerLevel[p];
}
