import * as TweakpaneTablePlugin from 'tweakpane-table';

import { Destructors, HackLevel, PowerLevel, ShipDriver } from '@starwards/core';
import { Model, addTextBlade, createPane } from '../panel';
import { aggregate, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { RowApi } from 'tweakpane-table';
import { WidgetContainer } from '../container';
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

const totalWidth = 370;
const cellWidth = 50;
export function drawSystemsStatus(container: WidgetContainer, shipDriver: ShipDriver, systems = shipDriver.systems) {
    const panelCleanup = new Destructors();
    const pane = createPane({ title: 'Systems Status', container: container.getElement().get(0) });
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
            { label: 'Status', width: `${cellWidth}px` },
            { label: 'Power', width: `${cellWidth}px` },
            { label: 'Heat', width: `${cellWidth}px` },
            { label: 'Hacked', width: `${cellWidth}px` },
        ],
    });
    for (const system of systems) {
        const standardRowApi = pane.addBlade({
            view: 'tableRow',
            label: system.state.name,
        }) as RowApi;

        const brokenProp = readProp(shipDriver, `${system.pointer}/broken`);
        const defectibleProps = [brokenProp, ...system.defectibles.map(defectReadProp(shipDriver))];
        addStatusBlade(standardRowApi, aggregate(defectibleProps, system.getStatus), (p) => p, panelCleanup, {
            OK: 'OK',
            DAMAGED: 'WARN',
            DISABLED: 'ERROR',
        });

        addStatusBlade(
            standardRowApi,
            readProp<PowerLevel>(shipDriver, `${system.pointer}/power`),
            (p: PowerLevel) => PowerLevel[p],
            panelCleanup,
            {
                [PowerLevel.MAX]: 'OK',
                [PowerLevel.HIGH]: 'OK',
                [PowerLevel.MID]: 'WARN',
                [PowerLevel.LOW]: 'WARN',
                [PowerLevel.SHUTDOWN]: 'ERROR',
            },
        );

        addStatusBlade(
            standardRowApi,
            aggregate([readProp<number>(shipDriver, `${system.pointer}/heat`)], system.getHeatStatus),
            system.getHeatStatus,
            panelCleanup,
            {
                OK: 'OK',
                WARMING: 'WARN',
                OVERHEAT: 'ERROR',
            },
        );

        addStatusBlade(
            standardRowApi,
            readProp<HackLevel>(shipDriver, `${system.pointer}/hacked`),
            (p: HackLevel) => HackLevel[p],
            panelCleanup,
            {
                [HackLevel.OK]: 'OK',
                [HackLevel.COMPROMISED]: 'WARN',
                [HackLevel.DISABLED]: 'ERROR',
            },
        );
    }
}
function addStatusBlade<T extends string | number>(
    standardRowApi: TweakpaneTablePlugin.RowApi,
    prop: Model<T>,
    format: (p: T) => string,
    panelCleanup: Destructors,
    hackedStatusColor: Record<T, 'OK' | 'WARN' | 'ERROR'>,
) {
    const blade = addTextBlade(standardRowApi.getPane(), prop, { format, width: `${cellWidth}px` }, panelCleanup.add);
    blade.element.classList.add('heat', 'tp-rotv'); // This allows overriding tweakpane theme for this folder
    const applyTheme = () => (blade.element.dataset.status = hackedStatusColor[prop.getValue()]); // this will change tweakpane theme for this folder, see tweakpane.css
    panelCleanup.add(prop.onChange(applyTheme));
    applyTheme();
}
