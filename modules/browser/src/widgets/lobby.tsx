import { AdminDriver, Driver } from '../driver';
import { Animator, AnimatorGeneralProvider } from '@arwes/animation';
// import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
import { ArwesThemeProvider, Button, StylesBaseline } from '@arwes/core';
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import React, { useEffect, useState } from 'react';

import { BleepsProvider } from '@arwes/sounds';
import { DashboardWidget } from './dashboard';
import { TaskLoop } from '../task-loop';
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

const InGameMenu = (p: Props) => {
    const [ships, setShips] = useState<string[]>([]);
    const [adminDriver, setAdminDriver] = useState<AdminDriver | null>(null);
    useEffect(() => {
        void p.driver.getAdminDriver().then(setAdminDriver);
    }, [p.driver]);

    useEffect(() => {
        const loop = new TaskLoop(async () => {
            setShips([...(await p.driver.getCurrentShipIds())]);
        }, 500);
        loop.start();
        return loop.stop;
    });
    const layouts = new Set<string>();
    for (const key in localStorage) {
        if (key.startsWith('layout:')) {
            layouts.add(key.substring('layout:'.length));
        }
    }
    return (
        <>
            {adminDriver && (
                <Button key="Stop Game" palette="error" onClick={adminDriver?.stopGame}>
                    Stop Game
                </Button>
            )}
            <pre key="Game Master">
                <h2 key={`title-gm`}>GM</h2>
                <Button key="Game Master" onClick={() => window.location.assign(`gm.html`)}>
                    Game Master
                </Button>
            </pre>
            {[...ships].flatMap((shipId: string) => (
                <pre key={`ship-${shipId}`}>
                    <h2 key={`title-ship-${shipId}`}> Ship {shipId}</h2>
                    <Button
                        key="Main Screen"
                        palette="secondary"
                        onClick={() => window.location.assign(`main-screen.html?ship=${shipId}`)}
                    >
                        Main Screen
                    </Button>
                    {[...layouts].map((layout) => (
                        <Button
                            key={`ship-${shipId}-layout-${layout}`}
                            onClick={() => window.location.assign(`ship.html?ship=${shipId}&layout=${layout}`)}
                        >
                            {layout}
                        </Button>
                    ))}
                    <Button
                        key={`empty-${shipId}`}
                        palette="secondary"
                        onClick={() => window.location.assign(`ship.html?ship=${shipId}`)}
                    >
                        Empty Screen
                    </Button>
                </pre>
            ))}
        </>
    );
};

export const Lobby = (p: Props) => {
    const [gamesCount, setgamesCount] = useState(false);
    const [adminDriver, setAdminDriver] = useState<AdminDriver | null>(null);

    useEffect(() => {
        void p.driver.getAdminDriver().then(setAdminDriver);
    }, [p.driver]);

    useEffect(() => {
        const loop = new TaskLoop(async () => {
            setgamesCount(await p.driver.isActiveGame());
        }, 500);
        loop.start();
        return loop.stop;
    });
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
                        <h1>Starwards</h1>
                        {gamesCount && adminDriver && <InGameMenu driver={p.driver}></InGameMenu>}

                        {!gamesCount && adminDriver && (
                            <Button key="new game" palette="success" onClick={adminDriver.startGame}>
                                New Game
                            </Button>
                        )}
                        <pre key="Utilities">
                            <h2>Utilities</h2>
                            <Button
                                key="input"
                                palette="secondary"
                                onClick={() => window.location.assign('input.html')}
                            >
                                Input
                            </Button>
                        </pre>
                    </div>
                </AnimatorGeneralProvider>
            </BleepsProvider>
        </ArwesThemeProvider>
    );
};

export type Props = { driver: Driver };
export const lobbyWidget: DashboardWidget<Props> = {
    name: 'lobby',
    type: 'react-component',
    component: Lobby,
    defaultProps: {},
};
