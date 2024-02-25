import { ArwesThemeProvider, StylesBaseline, Text } from '@arwes/core';
import React, { Component, useEffect, useRef } from 'react';
import { defectReadProp, useProperties } from '../react/hooks';

import { BleepsProvider } from '@arwes/sounds';
import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';
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

function SystemStatusReport({ name, status, isOk }: { name: string; status: string; isOk: boolean }) {
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
                --------------------------
                <br />
                <b>{name} :</b> {status}
            </Text>
            <br />
        </>
    );
}
function AllReports({ driver }: { driver: ShipDriver }) {
    const divRef = useRef<null | HTMLDivElement>(null);
    const defectsState = useProperties(driver.systems.flatMap((s) => s.defectibles).map(defectReadProp(driver))).sort(
        (a, b) => a.alertTime - b.alertTime,
    );
    return (
        <>
            <>
                <Text animator={{ duration, activate: true }}>
                    <h1>Damage Report</h1>
                </Text>
                <br />
            </>
            {defectsState.map((d) => (
                <SystemStatusReport key={d.pointer} name={d.name} status={d.status} isOk={d.isOk} />
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
