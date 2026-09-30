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

type System = ShipDriver['systems'][number];
type Tone = 'WARN' | 'ERROR' | undefined;

const totalWidth = 600;
const defaultDefectibleWidth = 80;
const defaultSystemNameWidth = 130;
const fitSystemNameWidth = 96;
const fitDefectBarWidth = 28;
const fitDefectLabelWidth = 56;

const defaultWidths = { status: '60px', power: '60px', epm: '60px', heat: '60px', coolant: '120px', hacked: '60px' };
const fitWidths = { status: '38px', power: '52px', epm: '34px', heat: '52px', coolant: '52px', eff: '40px' };

/** Short readable label per defect name; a name not listed here is shown in full. */
const defectShortLabels: Record<string, string> = {
    efficiency: 'EFF',
    effeciency: 'EFF',
    offset: 'OFFSET',
    capacity: 'CAP',
    velocity: 'VEL',
    damage: 'DMG',
    range: 'RANGE',
    'job success': 'JOB OK',
    'job speed': 'JOB SPD',
    'bearing skew': 'SKEW',
    'rate of fire': 'ROF',
    'range fluctuation': 'RNG FLUX',
    'turn speed': 'TURN',
    'traverse limit': 'TRAV',
};

function shortDefectLabel(name: string) {
    return defectShortLabels[name] ?? name.toUpperCase();
}

/**
 * `fit`: the engineer station's Systems pane (see `drawSystemsTable`). Otherwise the wide table
 * with one row of labelled defect bars under each system, for the GM and the legacy ship screen.
 */
export function drawFullSystemsStatus(
    container: WidgetContainer,
    shipDriver: ShipDriver,
    systems = shipDriver.systems,
    fit = false,
) {
    if (fit) {
        drawSystemsTable(container, shipDriver, systems);
        return;
    }
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Full Systems Status');
    container.getElement().width(`${totalWidth}px`);
    const w = defaultWidths;
    const defectibleWidth = `${defaultDefectibleWidth}px`;
    pane.registerPlugin(TweakpaneTablePlugin);
    pane.addBlade({
        view: 'tableHead',
        label: '',
        headers: [
            { label: 'Status', width: w.status },
            { label: 'Power', width: w.power },
            { label: 'EPM', width: w.epm },
            { label: 'Heat', width: w.heat },
            { label: 'Coolant', width: w.coolant },
            { label: 'Hacked', width: w.hacked },
        ],
    });
    for (const system of systems) {
        const statusProps = statusChangeProps(shipDriver, system);
        const standardRowApi = pane.addBlade({
            view: 'tableRow',
            label: system.state.name,
        }) as RowApi;

        const statusCell = addTextCellToRow(
            standardRowApi,
            aggregate(statusProps, system.getStatus),
            { width: w.status },
            panelCleanup.add,
        );
        statusCell.element.classList.add('tp-rotv'); // This allows overriding tweakpane theme for this folder
        const applyThemeByStatus = () => (statusCell.element.dataset.status = system.getStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
        panelCleanup.add(abstractOnChange(statusProps, system.getStatus, applyThemeByStatus));
        applyThemeByStatus();
        addTextCellToRow(
            standardRowApi,
            readProp<number>(shipDriver, `${system.pointer}/power`),
            { format: (p: PowerLevel) => PowerLevel[p], width: w.power },
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
            { format: (p: HackLevel) => HackLevel[p], width: w.hacked },
            panelCleanup.add,
        );

        const defectiblesRowApi = pane.addBlade({ view: 'tableRow', label: '', cells: [] }) as RowApi;
        for (const d of system.defectibles) {
            const defectibleProp = readNumberProp(shipDriver, `${d.systemPointer}/${d.field}`);
            defectiblesRowApi.addCell({ ...configTextBlade({}, () => d.name), width: defectibleWidth });
            addBarCellToRow(defectiblesRowApi, defectibleProp, { width: defectibleWidth }, panelCleanup.add);
        }
        pane.addBlade({ view: 'separator' });
    }
    container.getElement().find('.tp-lblv_v').css('min-width', 'fit-content');
    container.getElement().find('.tp-lblv_l').css('min-width', `${defaultSystemNameWidth}px`);
}

function statusChangeProps(shipDriver: ShipDriver, system: System) {
    return [
        readProp(shipDriver, `${system.pointer}/broken`),
        readProp(shipDriver, `${system.pointer}/energyStarved`),
        ...system.defectibles.map(defectReadProp(shipDriver)),
    ];
}

/** What the STAT cell says: the worst fault first (broken, then defect or starvation, then heat); nothing while all is well. */
function faultOf(system: System): { text: string; tone: Tone } {
    const status = system.getStatus();
    if (status === 'DISABLED') {
        return { text: 'BRKN', tone: 'ERROR' };
    }
    if (status === 'STARVED') {
        return { text: 'STRV', tone: 'WARN' };
    }
    if (status !== 'OK') {
        return { text: 'DMG', tone: 'WARN' };
    }
    const heat = system.getHeatStatus();
    if (heat === 'OK') {
        return { text: '', tone: undefined };
    }
    return { text: 'HOT', tone: heat === 'OVERHEAT' ? 'ERROR' : 'WARN' };
}

function heatTone(system: System): Tone {
    const heat = system.getHeatStatus();
    if (heat === 'OK') {
        return undefined;
    }
    return heat === 'OVERHEAT' ? 'ERROR' : 'WARN';
}

/** Marks a bar cell so its fill turns amber or red (`data-tint`, see tweakpane.css). */
function applyTint(element: HTMLElement, tone: Tone) {
    if (tone) {
        element.dataset.tint = tone;
    } else {
        delete element.dataset.tint;
    }
}

/**
 * The engineer station's Systems pane: SYSTEM | STAT | POWER | EPM | HEAT | COOLANT | EFF, each
 * level a bar and STAT naming only a fault. A system's defects follow as one line of labelled
 * bars, because the repair queue cannot be aimed without them.
 */
function drawSystemsTable(container: WidgetContainer, shipDriver: ShipDriver, systems: System[]) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Systems');
    const w = fitWidths;
    pane.registerPlugin(TweakpaneTablePlugin);
    pane.addBlade({
        view: 'tableHead',
        label: 'SYSTEM',
        headers: [
            { label: 'STAT', width: w.status },
            { label: 'PWR', width: w.power },
            { label: 'EPM', width: w.epm },
            { label: 'HEAT', width: w.heat },
            { label: 'COOL', width: w.coolant },
            { label: 'EFF', width: w.eff },
        ],
    });
    for (const system of systems) {
        const pointer = system.pointer;
        const heatProp = readProp<number>(shipDriver, `${pointer}/heat`);
        const row = pane.addBlade({ view: 'tableRow', label: system.state.name }) as RowApi;

        const faultProps = [...statusChangeProps(shipDriver, system), heatProp];
        const statCell = addTextCellToRow(
            row,
            aggregate(faultProps, () => faultOf(system).text),
            { width: w.status },
            panelCleanup.add,
        );
        statCell.element.classList.add('tp-rotv'); // lets data-status theme the cell, see tweakpane.css
        const applyFault = () => (statCell.element.dataset.status = faultOf(system).tone ?? 'OK'); // dark while nothing is wrong
        panelCleanup.add(abstractOnChange(faultProps, () => `${faultOf(system).tone}`, applyFault));
        applyFault();

        addBarCellToRow(row, readNumberProp(shipDriver, `${pointer}/power`), { width: w.power }, panelCleanup.add);
        addTextCellToRow(
            row,
            readProp<number>(shipDriver, `${pointer}/energyPerMinute`),
            { format: (epm: number) => `${Math.round(epm)}`, width: w.epm },
            panelCleanup.add,
        );
        const heatCell = addBarCellToRow(
            row,
            readNumberProp(shipDriver, `${pointer}/heat`),
            { width: w.heat },
            panelCleanup.add,
        );
        const applyHeatTint = () => applyTint(heatCell.element, heatTone(system));
        panelCleanup.add(abstractOnChange([heatProp], () => heatTone(system), applyHeatTint));
        applyHeatTint();
        addBarCellToRow(
            row,
            readNumberProp(shipDriver, `${pointer}/coolantFactor`),
            { width: w.coolant },
            panelCleanup.add,
        );

        const effProps = [
            readProp(shipDriver, `${pointer}/broken`),
            readProp(shipDriver, `${pointer}/power`),
            readProp(shipDriver, `${pointer}/hacked`),
        ];
        const effCell = addTextCellToRow(
            row,
            aggregate(effProps, () => system.state.effectiveness),
            { format: (e: number) => `${Math.round((e / Number(PowerLevel.NORMAL)) * 100)}%`, width: w.eff },
            panelCleanup.add,
        );
        const effTone = (): Tone => {
            if (system.state.broken || system.state.hacked === HackLevel.DISABLED) {
                return 'ERROR';
            }
            return system.state.hacked < HackLevel.OK ? 'WARN' : undefined;
        };
        const applyEffTone = () => applyTint(effCell.element, effTone());
        panelCleanup.add(abstractOnChange(effProps, effTone, applyEffTone));
        applyEffTone();

        addFitDefectRow(pane, shipDriver, system, panelCleanup.add);
    }
    container.getElement().find('.tp-lblv_v').css('min-width', 'fit-content');
    container.getElement().find('.tp-lblv_l').css('min-width', `${fitSystemNameWidth}px`);
}

/** One line under a system: an empty name column, then label + bar pairs on a fixed grid. */
function addFitDefectRow(pane: Pane, shipDriver: ShipDriver, system: System, cleanup: (d: Destructor) => void) {
    if (system.defectibles.length === 0) {
        return;
    }
    const row = pane.addBlade({ view: 'tableRow', label: '', cells: [] }) as RowApi;
    row.element.classList.add('sw-defect-row');
    for (const d of system.defectibles) {
        const label = shortDefectLabel(d.name);
        const labelCell = row.addCell({ ...configTextBlade({}, () => label), width: `${fitDefectLabelWidth}px` });
        labelCell.element.classList.add('sw-defect-label');
        const bar = addBarCellToRow(
            row,
            readNumberProp(shipDriver, `${d.systemPointer}/${d.field}`),
            { width: `${fitDefectBarWidth}px` },
            cleanup,
        );
        bar.element.title = d.name;
    }
}
