import { ArwesThemeProvider, Button, FrameCorners, List, LoadingBars, StylesBaseline, Text } from '@arwes/core';
import { Driver, ShipDriver } from '../driver';
import React, { Component, ReactNode, useEffect, useState } from 'react';
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
    children: (i: T) => ReactNode;
};
function Repeater<T>({ data, children }: RepeaterProps<T>) {
    const elements = [];
    for (const item of data) {
        elements.push(children(item));
    }
    return <>{elements}</>;
}

function usePoll<T>(property: () => T) {
    const [value, updateValue] = useState(property());
    useEffect(() => {
        const interval = setInterval(() => {
            updateValue(property());
        }, REFRESH_MILLI);
        return () => clearInterval(interval);
    }, [property]);
    return value;
}

function ThrusterTweak({ driver }: { driver: ThrusterDriver }) {
    const angle = usePoll(driver.angle.getValue);
    const broken = usePoll(driver.broken.getValue);
    const palette = broken ? 'error' : 'primary';
    const onClick = () => driver.broken.onChange(!broken);
    return (
        <FrameCorners key={driver.index} palette={palette} hover>
            <Text>Thruster {driver.index}</Text>
            <List>
                <li> Direction : {ShipDirection[angle]}</li>
            </List>
            <Button onClick={onClick}>{broken ? 'Fix' : 'Break'}</Button>
        </FrameCorners>
    );
}

const SelectionTitle = ({ selected }: { selected: SpaceObject | undefined }) => (
    <Text>Selected : {selected?.type || 'None'}</Text>
);
function Tweak({ driver, selectionContainer }: Props) {
    const selected = useSelectedSingle(selectionContainer);
    const shipDriver = useShipDriver(selected, driver);
    if (Spaceship.isInstance(selected)) {
        if (shipDriver) {
            return (
                <>
                    <SelectionTitle selected={selected} />
                    <Repeater data={shipDriver.thrusters}>{(t) => <ThrusterTweak driver={t} />}</Repeater>
                </>
            );
        } else {
            return (
                <>
                    <SelectionTitle selected={selected} />
                    <LoadingBars animator={{ animate: false }} />
                </>
            );
        }
    } else return <SelectionTitle selected={selected} />;
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
