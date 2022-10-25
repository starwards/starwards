// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, StylesBaseline, Text } from '@arwes/core';
import React, { Component, useEffect, useMemo, useRef } from 'react';
import { ShipDriver, getDefectibles } from '@starwards/core';

import { BleepsProvider } from '@arwes/sounds';
import { DashboardWidget } from './dashboard';
import WebFont from 'webfontloader';
import { createMachine } from 'xstate';
import { readProp } from '../property-wrappers';
import { useMachine } from '@xstate/react';
import { useProperties } from '../react/hooks';

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

function SystemDamageReport({ name, status, isOk }: { name: string; status: string; isOk: boolean }) {
    const broken = !isOk;
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
                <b>{name} :</b> {status}
                <br />
                --------------------------
            </Text>
            <br />
        </>
    );
}
function AllReports({ driver }: { driver: ShipDriver }) {
    const divRef = useRef<null | HTMLDivElement>(null);
    const defectiblesProperties = useMemo(
        () =>
            getDefectibles(driver.state).map((d) => {
                const pointer = `${d.systemPointer}/${d.field}`;
                const nameProp = readProp<string>(driver, `${d.systemPointer}/name`);
                const numberProp = readProp<number>(driver, pointer);
                // abstract the number property as a property that only changes when the state of defect (`isOk`) changes
                let lastOk = numberProp.getValue() === d.normal;
                let alertTime = 0;
                return {
                    pointer: numberProp.pointer,
                    onChange(cb: () => unknown) {
                        return numberProp.onChange(() => {
                            const isOk = numberProp.getValue() === d.normal;
                            if (isOk !== lastOk) {
                                if (lastOk) {
                                    alertTime = Date.now();
                                }
                                lastOk = isOk;
                                cb();
                            }
                        });
                    },
                    getValue: () => {
                        const isOk = numberProp.getValue() === d.normal;
                        return { name: nameProp.getValue(), status: d.name, pointer, alertTime, isOk };
                    },
                };
            }),
        [driver]
    );
    const defectsState = useProperties(defectiblesProperties).sort((a, b) => a.alertTime - b.alertTime);

    return (
        <>
            <>
                <Text animator={{ duration, activate: true }}>
                    <h1>Damage Report</h1>
                    <h1>--------------------------</h1>
                </Text>
                <br />
            </>
            {defectsState.map((d) => (
                <SystemDamageReport key={d.pointer} {...d} />
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
