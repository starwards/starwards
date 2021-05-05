import { ArwesThemeProvider, Button, LoadingBars, StylesBaseline, Text } from '@arwes/core';
import { Driver, ShipDriver } from '../driver';
import React, { Component, useEffect, useState } from 'react';
import { ShipDirection, SpaceObject, Spaceship } from '@starwards/model';

import { DashboardWidget } from './dashboard';
import { SelectionContainer } from '../radar/selection-container';
import { ThrusterDriver } from '../driver/ship';
import WebFont from 'webfontloader';

WebFont.load({
    custom: {
        families: ['Electrolize', 'Titillium Web'],
    },
});

const REFRESH_MILLI = 100;
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

type RepeaterProps<T> = {
    data: Iterable<T>;
    children: (i: T) => JSX.Element;
};
function Repeater<T>({ data, children }: RepeaterProps<T>) {
    const elements = [];
    for (const item of data) {
        elements.push(children(item));
    }
    return <>{elements}</>;
}

function useProperty<T>(property: { getValue: () => T }) {
    const [value, updateValue] = useState(property.getValue());
    useEffect(() => {
        const interval = setInterval(() => {
            updateValue(property.getValue());
        }, REFRESH_MILLI);
        return () => clearInterval(interval);
    }, [property]);
    return value;
}

function ThrusterTweak({ driver }: { driver: ThrusterDriver }) {
    const angle = useProperty(driver.angle);
    const broken = useProperty(driver.broken);
    const palette = broken ? 'error' : 'primary';
    const onClick = () => driver.broken.onChange(!broken);
    return (
        <>
            Thruster {driver.index}. Direction : {ShipDirection[angle]}. Status:
            <Button palette={palette} onClick={onClick}>
                {broken ? 'Broken' : 'OK'}
            </Button>
        </>
    );
}

function Tweak({ driver, selectionContainer }: Props) {
    const selected = useSelectedSingle(selectionContainer);
    const shipDriver = useShipDriver(selected, driver);
    if (Spaceship.isInstance(selected)) {
        if (shipDriver) {
            return (
                <Repeater data={shipDriver.thrusters}>
                    {(t) => (
                        <div key={t.index}>
                            <ThrusterTweak driver={t} />
                            <br />
                        </div>
                    )}
                </Repeater>
            );
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
