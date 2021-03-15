import { AdminDriver, Driver } from '../driver';
import { Arwes, Button, Heading, SoundsProvider, ThemeProvider, createSounds, createTheme } from 'arwes';
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import React, { useEffect, useState } from 'react';

import { DashboardWidget } from './dashboard';
import { TaskLoop } from '../task-loop';
import WebFont from 'webfontloader';

WebFont.load({
    custom: {
        families: ['Electrolize', 'Titillium Web'],
    },
});

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
        // console.log(localStorage.getItem(key));
    }
    return (
        <ul>
            {adminDriver && (
                <li key="Stop Game">
                    <Button onClick={adminDriver?.stopGame}>Stop Game</Button>
                </li>
            )}
            <li key="Game Master">
                <Button onClick={() => window.location.assign(`gm.html`)}>Game Master</Button>
            </li>
            {[...ships].flatMap((shipId: string) => [
                <li key={`title-ship-${shipId}`}> Ship {shipId}</li>,
                <li key="Main Screen">
                    <Button onClick={() => window.location.assign(`main-screen.html?ship=${shipId}`)}>
                        Main Screen
                    </Button>
                </li>,
                ...[...layouts].map((layout) => (
                    <li key={`ship-${shipId}-layout-${layout}`}>
                        <Button onClick={() => window.location.assign(`ship.html?ship=${shipId}&layout=${layout}`)}>
                            {layout}
                        </Button>
                    </li>
                )),
                <li key={`empty-${shipId}`}>
                    <Button onClick={() => window.location.assign(`ship.html?ship=${shipId}`)}>Empty Screen</Button>
                </li>,
            ])}
        </ul>
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
        <ThemeProvider
            theme={createTheme({
                typography: {
                    headerFontFamily: '"Electrolize"',
                    fontFamily: '"Titillium Web"',
                },
            })}
        >
            <SoundsProvider
                sounds={createSounds({
                    shared: { volume: 1 }, // Shared sound settings
                    players: {
                        // The player settings
                        click: {
                            // With the name the player is created
                            sound: { src: ['/sound/click.mp3'] }, // The settings to pass to Howler
                        },
                        typing: {
                            sound: { src: ['/sound/typing.mp3'] },
                            settings: { oneAtATime: true }, // The custom app settings
                        },
                        deploy: {
                            sound: { src: ['/sound/deploy.mp3'] },
                            settings: { oneAtATime: true },
                        },
                    },
                })}
            >
                <Arwes pattern="images/glow.png" style={{ padding: 20 }}>
                    <div style={{ padding: 20, textAlign: 'center' }}>
                        <Heading>
                            <p>Starwards</p>
                        </Heading>
                        <ul>
                            {gamesCount && adminDriver && (
                                <li key="InGameMenu">
                                    <InGameMenu driver={p.driver}></InGameMenu>
                                </li>
                            )}
                            {!gamesCount && adminDriver && (
                                <li key="startGame">
                                    <Button onClick={adminDriver.startGame}>New Game</Button>
                                </li>
                            )}
                            <li key="input">
                                <Button key="input" onClick={() => window.location.assign('input.html')}>
                                    Input
                                </Button>
                            </li>
                        </ul>
                    </div>
                </Arwes>
            </SoundsProvider>
        </ThemeProvider>
    );
};

export type Props = { driver: Driver };
export const lobbyWidget: DashboardWidget<Props> = {
    name: 'lobby',
    type: 'react-component',
    component: Lobby,
    defaultProps: {},
};
