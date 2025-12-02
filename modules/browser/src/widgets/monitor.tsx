// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, Blockquote, StylesBaseline, Text } from '../components/arwes-compat';
import React, { Component } from 'react';
import { ReadProperty, defectReadProp, useProperties, useProperty } from '../react/hooks';
import { ShipDriver, System } from '@starwards/core';
import { readNumberProp, readProp } from '../property-wrappers';

import { BleepsProvider } from '../components/arwes-compat';
import { DashboardWidget } from './dashboard';
import WebFont from 'webfontloader';

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
type MetricProps = {
    property: ReadProperty<number>;
    metricName: string;
    warn: number;
    error: number;
};

function Metric({ property, metricName }: MetricProps) {
    const propertyValue = useProperty(property);
    if (propertyValue === undefined) {
        return null;
    }
    return (
        <Blockquote>
            <Text>
                {metricName} : {String(Math.round(propertyValue)).padStart(4, '0')}
            </Text>
        </Blockquote>
    );
}

function SystemMonitor({ driver, system }: { driver: ShipDriver; system: System }) {
    // wire hooks for all properties that might change system status
    useProperty<boolean>(readProp(driver, `${system.pointer}/broken`));
    useProperties(system.defectibles.map(defectReadProp(driver)));

    // use API to calculate status instead of logic replication
    const status = system.getStatus();
    return (
        <Blockquote>
            <Text>
                {system.state.name} : {status}
            </Text>
        </Blockquote>
    );
}

export function monitorWidget(shipDriver: ShipDriver): DashboardWidget {
    class Monitor extends Component {
        render() {
            return (
                <ArwesThemeProvider>
                    <StylesBaseline styles={{ body: { fontFamily: 'Electrolize' } }} />
                    <BleepsProvider
                        audioSettings={audioSettings}
                        playersSettings={playersSettings}
                        bleepsSettings={bleepsSettings}
                    >
                        <div style={{ padding: 20, textAlign: 'center' }}>
                            <Metric
                                property={readNumberProp(shipDriver, `/reactor/energy`)}
                                metricName="Energy"
                                error={100}
                                warn={300}
                            />
                            <Metric
                                property={readNumberProp(shipDriver, `/maneuvering/afterBurnerFuel`)}
                                metricName="Afterburner"
                                error={500}
                                warn={2000}
                            />
                            {shipDriver.systems.map((s) => (
                                <SystemMonitor key={s.pointer} system={s} driver={shipDriver} />
                            ))}
                        </div>
                    </BleepsProvider>
                </ArwesThemeProvider>
            );
        }
    }

    return {
        name: 'monitor',
        type: 'react-component',
        component: Monitor,
        defaultProps: {},
    };
}
