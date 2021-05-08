import { ArwesThemeProvider, Button, FrameCorners, List, LoadingBars, StylesBaseline, Text } from '@arwes/core';
import React, { Component, ReactNode, useEffect, useState } from 'react';
import { ShipDirection, SpaceObject, Spaceship } from '@starwards/model';
import { useSelected, useShipDriver } from '../react/hooks';

import { DashboardWidget } from './dashboard';
import { Driver } from '../driver';
import { SelectionContainer } from '../radar/selection-container';
import { ThrusterDriver } from '../driver/ship';
import WebFont from 'webfontloader';
import pluralize from 'pluralize';

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

const SelectionTitle = ({ selectionContainer }: { selectionContainer: SelectionContainer }) => {
    const counts = {} as Record<SpaceObject['type'], number>;
    const selected = useSelected(selectionContainer);
    for (const { type } of selected) {
        counts[type] = (counts[type] || 0) + 1;
    }
    const message = Object.entries(counts)
        .map(([type, count]) => pluralize(type, count, true))
        .join(', ');
    return <pre>{message || 'None'} Selected</pre>;
};

function Tweak({ driver, selectionContainer }: Props) {
    const selected = useSelected(selectionContainer);
    const shipDriver = useShipDriver(selected[0], driver);
    if (selected.length === 1 && Spaceship.isInstance(selected[0])) {
        if (shipDriver) {
            return (
                <>
                    <SelectionTitle selectionContainer={selectionContainer} />
                    <Repeater data={shipDriver.thrusters}>{(t) => <ThrusterTweak driver={t} />}</Repeater>
                </>
            );
        } else {
            return (
                <>
                    <SelectionTitle selectionContainer={selectionContainer} />
                    <LoadingBars animator={{ animate: false }} />
                </>
            );
        }
    } else return <SelectionTitle selectionContainer={selectionContainer} />;
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
