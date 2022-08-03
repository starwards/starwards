// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, Blockquote, StylesBaseline, Text } from '@arwes/core';
import React, { Component } from 'react';
import { ReadProperty, useProperty } from '../react/hooks';
import { ShipDirection, ShipDriver, ThrusterDriver } from '@starwards/model';

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
    const propertyValue = useProperty(property, 100);
    const palette: Palette = propertyValue > warn ? 'success' : propertyValue > error ? 'secondary' : 'error';
    return (
        <Blockquote palette={palette} animator={{ animate: false }}>
            <Text>
                {metricName} : {String(Math.round(propertyValue)).padStart(4, '0')}
            </Text>
        </Blockquote>
    );
}

function ThrusterMonitor({ driver }: { driver: ThrusterDriver }) {
    const angle = useProperty(driver.angle);
    const broken = useProperty(driver.broken);
    const palette: Palette = broken ? 'error' : 'success';
    const status = broken ? 'ERROR' : 'OK';
    return (
        <Blockquote palette={palette} animator={{ animate: false }}>
            <Text>
                Thruster {driver.index} ({ShipDirection[angle]}) : {status}
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
                            <Metric property={shipDriver.energy} metricName="Energy" error={100} warn={300} />
                            <Metric
                                property={shipDriver.afterBurnerFuel}
                                metricName="Afterburner"
                                error={500}
                                warn={2000}
                            />
                            {[...shipDriver.thrusters].map((t) => (
                                <ThrusterMonitor key={t.index} driver={t} />
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
