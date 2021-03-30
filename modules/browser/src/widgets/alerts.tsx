// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, Blockquote, StylesBaseline, Text } from '@arwes/core';
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import React, { Component } from 'react';

import { AnimatorGeneralProvider } from '@arwes/animation';
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
const generalAnimator = { duration: { enter: 200, exit: 200 } };

export function alertsWidget(_shipDriver: ShipDriver): DashboardWidget {
    class Alerts extends Component {
        render() {
            return (
                <ArwesThemeProvider>
                    <StylesBaseline styles={{ body: { fontFamily: 'Electrolize' } }} />
                    <BleepsProvider
                        audioSettings={audioSettings}
                        playersSettings={playersSettings}
                        bleepsSettings={bleepsSettings}
                    >
                        <AnimatorGeneralProvider animator={generalAnimator}>
                            <div style={{ padding: 20, textAlign: 'center' }}>
                                <Blockquote palette="error">
                                    <Text>Lorem ipsum dolor sit amet</Text>
                                </Blockquote>
                            </div>
                        </AnimatorGeneralProvider>
                    </BleepsProvider>
                </ArwesThemeProvider>
            );
        }
    }

    return {
        name: 'alerts',
        type: 'react-component',
        component: Alerts,
        defaultProps: {},
    };
}
