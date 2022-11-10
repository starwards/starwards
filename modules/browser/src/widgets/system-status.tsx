import { ArwesThemeProvider, StylesBaseline, Table } from '@arwes/core';
import React, { Component } from 'react';
import { ShipDriver, System } from '@starwards/core';
import { defectReadProp, useProperties } from '../react/hooks';

import { BleepsProvider } from '@arwes/sounds';
import { DashboardWidget } from './dashboard';
import WebFont from 'webfontloader';
import { readProp } from '../property-wrappers';

WebFont.load({
    custom: {
        families: ['Electrolize', 'Titillium Web'],
    },
});

const audioSettings = { common: { volume: 0.25 } };
const playersSettings = {
    object: { src: ['/sound/click.mp3'] },
    type: { src: ['/sound/typing.mp3'], loop: true },
};
const bleepsSettings = {
    object: { player: 'object' },
    type: { player: 'type' },
};

function Content({ driver, systems }: { driver: ShipDriver; systems: System[] }) {
    useProperties(systems.map((system) => readProp(driver, `${system.pointer}/broken`)));
    useProperties(systems.flatMap((system) => system.defectibles.map(defectReadProp(driver))));

    const dataset = systems.map((system) => ({
        id: system.pointer,
        columns: [
            { id: 'name', data: system.state.name },
            { id: 'status', data: system.getStatus() },
        ],
    }));

    const columnWidths = ['70%', '30%'];
    return <Table headers={[]} dataset={dataset} columnWidths={columnWidths} />;
}

export function systemsStatusWidget(shipDriver: ShipDriver): DashboardWidget {
    class SystemsStatus extends Component {
        render() {
            return (
                <ArwesThemeProvider>
                    <StylesBaseline styles={{ body: { fontFamily: 'Electrolize' } }} />
                    <BleepsProvider
                        audioSettings={audioSettings}
                        playersSettings={playersSettings}
                        bleepsSettings={bleepsSettings}
                    >
                        <Content systems={shipDriver.systems} driver={shipDriver} />
                    </BleepsProvider>
                </ArwesThemeProvider>
            );
        }
    }

    return {
        name: 'systems status',
        type: 'react-component',
        component: SystemsStatus,
        defaultProps: {},
    };
}
