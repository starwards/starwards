// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, Blockquote, StylesBaseline, Text } from '@arwes/core';
import React, { Component } from 'react';
import { ReadProperty, useDefectibles, useProperty } from '../react/hooks';
import { ShipDirection, ShipDriver, Thruster } from '@starwards/core';
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

function ThrusterMonitor({ driver, thruster }: { driver: ShipDriver; thruster: Thruster }) {
    const angle = useProperty<ShipDirection>(readProp(driver, `/thrusters/${thruster.index}/angle`));
    const broken = useProperty<boolean>(readProp(driver, `/thrusters/${thruster.index}/broken`));
    const damaged = useDefectibles(driver)
        .filter((d) => d.name === thruster.name)
        .some((d) => !d.isOk);

    const palette: Palette = broken ? 'error' : damaged ? 'secondary' : 'success';
    const status = broken ? 'OFFLINE' : damaged ? 'DAMAGED' : 'OK';
    return (
        <Blockquote palette={palette} animator={{ animate: false }}>
            <Text>
                Thruster {thruster.index} ({ShipDirection[angle]}) : {status}
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
                            {shipDriver.state.thrusters.map((t) => (
                                <ThrusterMonitor key={t.index} thruster={t} driver={shipDriver} />
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
