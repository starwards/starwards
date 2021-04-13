// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, Blockquote, StylesBaseline, Text } from '@arwes/core';
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import React, { Component, useEffect, useState } from 'react';

import { BleepsProvider } from '@arwes/sounds';
import { DashboardWidget } from './dashboard';
import { ShipDriver } from '../driver';
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
type Props = {
    shipDriver: ShipDriver;
    metricName: string;
    warn: number;
    error: number;
};

function Metric({ shipDriver, metricName, warn, error }: Props) {
    const [metricValue, setMetric] = useState<number>(shipDriver.state.energy);
    useEffect(() => {
        shipDriver.events.on(metricName, setMetric);
        return () => {
            shipDriver.events.off(metricName, setMetric);
        };
    }, [metricName, setMetric, shipDriver]);
    const palette: Palette = metricValue > warn ? 'success' : metricValue > error ? 'secondary' : 'error';
    return (
        <Blockquote palette={palette} animator={{ animate: false }}>
            <Text>
                {metricName} : {String(Math.round(metricValue)).padStart(4, '0')}
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
                            <Metric shipDriver={shipDriver} metricName="energy" error={100} warn={300} />
                            <Metric shipDriver={shipDriver} metricName="afterBurnerFuel" error={500} warn={2000} />
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
