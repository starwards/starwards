import { ArwesThemeProvider, StylesBaseline, Text } from '@arwes/core';
import React, { Component, useEffect, useState } from 'react';

import { BleepsProvider } from '@arwes/sounds';
import { DashboardWidget } from './dashboard';
import { Driver } from '../driver';
import { SelectionContainer } from '../radar/selection-container';
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
type Props = {
    driver: Driver;
    selectionContainer: SelectionContainer;
};

function Tweak({ driver: _f, selectionContainer }: Props) {
    const [selected, setSelected] = useState(0);

    useEffect(() => {
        const handleSelectionChange = () => {
            setSelected(selectionContainer.selectedItems.size);
        };
        selectionContainer.events.addListener('changed', handleSelectionChange);
        return () => {
            window.removeEventListener('changed', handleSelectionChange);
        };
    }, [selectionContainer]);
    return <Text>Selected : {selected}</Text>;
}

export function tweakWidget(driver: Driver, selectionContainer: SelectionContainer): DashboardWidget {
    class TweakRoot extends Component {
        render() {
            return (
                <ArwesThemeProvider>
                    <StylesBaseline styles={{ body: { fontFamily: 'Electrolize' } }} />
                    <BleepsProvider
                        audioSettings={audioSettings}
                        playersSettings={playersSettings}
                        bleepsSettings={bleepsSettings}
                    >
                        <Tweak driver={driver} selectionContainer={selectionContainer} />
                    </BleepsProvider>
                </ArwesThemeProvider>
            );
        }
    }

    return {
        name: 'tweak',
        type: 'react-component',
        component: TweakRoot,
        defaultProps: {},
    };
}
