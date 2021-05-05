import { ArwesThemeProvider, LoadingBars, StylesBaseline, Text } from '@arwes/core';
import { Driver, ShipDriver } from '../driver';
import React, { Component, useEffect, useState } from 'react';
import { SpaceObject, Spaceship } from '@starwards/model';

import { DashboardWidget } from './dashboard';
import { SelectionContainer } from '../radar/selection-container';
import WebFont from 'webfontloader';

WebFont.load({
    custom: {
        families: ['Electrolize', 'Titillium Web'],
    },
});

type Props = {
    driver: Driver;
    selectionContainer: SelectionContainer;
};

function useSelectedSingle(selectionContainer: SelectionContainer): SpaceObject | undefined {
    const [selected, setSelected] = useState(selectionContainer.getSingle());

    useEffect(() => {
        const handleSelectionChange = () => {
            setSelected(selectionContainer.getSingle());
        };
        selectionContainer.events.addListener('changed', handleSelectionChange);
        return () => {
            window.removeEventListener('changed', handleSelectionChange);
        };
    }, [selectionContainer]);
    return selected;
}

function Tweak({ driver, selectionContainer }: Props) {
    const selected = useSelectedSingle(selectionContainer);
    const shipDriver = useShipDriver(selected, driver);

    if (Spaceship.isInstance(selected)) {
        if (shipDriver) {
            return <> </>;
        } else {
            return <LoadingBars animator={{ animate: false }} />;
        }
    } else return <Text>Selected : {selected?.type || 'None'}</Text>;
}

function useShipDriver(selected: SpaceObject | undefined, driver: Driver): ShipDriver | undefined {
    const [shipDriver, setShipDriver] = useState<ShipDriver | undefined>(undefined);
    useEffect(() => {
        if (Spaceship.isInstance(selected)) {
            void driver.getShipDriver(selected.id).then(setShipDriver);
        }
    }, [driver, selected]);
    return shipDriver;
}

export function tweakWidget(driver: Driver, selectionContainer: SelectionContainer): DashboardWidget {
    class TweakRoot extends Component {
        render() {
            return (
                <ArwesThemeProvider>
                    <StylesBaseline styles={{ body: { fontFamily: 'Electrolize' } }} />
                    <Tweak driver={driver} selectionContainer={selectionContainer} />
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
