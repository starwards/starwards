// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, Blockquote, StylesBaseline, Text } from '@arwes/core';
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import React, { Component } from 'react';
import { ReadProperty, useProperty } from '../react/hooks';

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
    property: ReadProperty<number>;
    metricName: string;
    warn: number;
    error: number;
};

function Metric({ property, metricName, warn, error }: Props) {
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
