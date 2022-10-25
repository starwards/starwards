// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, Blockquote, StylesBaseline, Text } from '@arwes/core';
import React, { Component } from 'react';
import { ReadProperty, defectReadProp, useProperties, useProperty } from '../react/hooks';
import { ShipDriver, System } from '@starwards/core';
import { readNumberProp, readProp } from '../property-wrappers';

import { BleepsProvider } from '@arwes/sounds';
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
type Palette = 'primary' | 'secondary' | 'success' | 'error';
type MetricProps = {
    property: ReadProperty<number>;
    metricName: string;
    warn: number;
    error: number;
};

function Metric({ property, metricName, warn, error }: MetricProps) {
    const propertyValue = useProperty(property);
    const palette: Palette = propertyValue > warn ? 'success' : propertyValue > error ? 'secondary' : 'error';
    return (
        <Blockquote palette={palette} animator={{ animate: false }}>
            <Text>
                {metricName} : {String(Math.round(propertyValue)).padStart(4, '0')}
            </Text>
        </Blockquote>
    );
}

function SystemMonitor({ driver, system }: { driver: ShipDriver; system: System }) {
    const broken = useProperty<boolean>(readProp(driver, `${system.pointer}/broken`));
    const damaged = useProperties(system.defectibles.map(defectReadProp(driver))).some((d) => !d.isOk);

    const palette: Palette = broken ? 'error' : damaged ? 'secondary' : 'success';
    const status = broken ? 'OFFLINE' : damaged ? 'DAMAGED' : 'OK';
    return (
        <Blockquote palette={palette} animator={{ animate: false }}>
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
                                property={readNumberProp(shipDriver, `/reactor/afterBurnerFuel`)}
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
