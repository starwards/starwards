// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, StylesBaseline, Text } from '@arwes/core';
import React, { Component, useEffect, useRef } from 'react';
import { ShipDirection, ShipDriver, Thruster } from '@starwards/core';
import { readNumberProp, readProp } from '../property-wrappers';
import { useConstant, useLoop, useProperty, useSorted } from '../react/hooks';

import { BleepsProvider } from '@arwes/sounds';
import { DashboardWidget } from './dashboard';
import WebFont from 'webfontloader';
import { createMachine } from 'xstate';
import { useMachine } from '@xstate/react';

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
const duration = { enter: 2 * 1000, exit: 1000 };

const disappearMachine = createMachine({
    id: 'disappear',
    initial: 'hide',
    states: {
        show: {
            on: { false: 'exiting' },
        },
        exiting: {
            on: { true: 'show' },
            after: {
                [duration.exit]: { target: 'hide' },
            },
        },
        hide: {
            on: { true: 'show' },
        },
    },
});

function ThrusterDamageReport({ driver, thruster }: { driver: ShipDriver; thruster: Thruster }) {
    const angle = useProperty<ShipDirection>(readProp(driver, `/thrusters/${thruster.index}/angle`));
    const broken = useProperty<boolean>(readProp(driver, `/thrusters/${thruster.index}/broken`));
    const [current, send] = useMachine(disappearMachine);

    useEffect(() => {
        send(String(broken));
    }, [broken, send]);

    if (current.matches('hide')) {
        return null;
    }
    return (
        <>
            <Text animator={{ duration, activate: broken }}>
                --------------------------
                <h1>Damage Report</h1>
                Thruster {thruster.index} ({ShipDirection[angle]}) is not working
            </Text>
            <br />
        </>
    );
}

type BrokenThrusters = { [k: number]: boolean };

function AllReports({ driver }: { driver: ShipDriver }) {
    const divRef = useRef<null | HTMLDivElement>(null);
    const brokenThrusters = useConstant<BrokenThrusters>(() =>
        [...driver.state.thrusters].reduce<BrokenThrusters>(
            (r, thruster) => ({ ...r, [thruster.index]: thruster.broken }),
            {}
        )
    );
    const [thrusters, pushToEnd] = useSorted([...driver.state.thrusters]);

    useLoop(
        () => {
            // scroll to the bottom
            divRef.current?.scrollIntoView({ behavior: 'smooth' });
            for (const thruster of driver.state.thrusters) {
                const broken = thruster.broken;
                // detect newly broken thruster
                if (brokenThrusters[thruster.index] !== broken) {
                    brokenThrusters[thruster.index] = broken;
                    if (broken) {
                        pushToEnd(thruster);
                    }
                }
            }
        },
        100,
        [driver.state.thrusters.map((t) => t.broken).join()]
    );
    return (
        <>
            {thrusters.map((t) => (
                <ThrusterDamageReport key={t.index} thruster={t} driver={driver} />
            ))}
            <div ref={divRef} />
        </>
    );
}

export function damageReportWidget(shipDriver: ShipDriver): DashboardWidget {
    class DamageReport extends Component {
        render() {
            return (
                <ArwesThemeProvider>
                    <StylesBaseline styles={{ body: { fontFamily: 'Electrolize' } }} />
                    <BleepsProvider
                        audioSettings={audioSettings}
                        playersSettings={playersSettings}
                        bleepsSettings={bleepsSettings}
                    >
                        <AllReports driver={shipDriver} />
                    </BleepsProvider>
                </ArwesThemeProvider>
            );
        }
    }

    return {
        name: 'damage report',
        type: 'react-component',
        component: DamageReport,
        defaultProps: {},
    };
}
