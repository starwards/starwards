/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import React, { useState, useEffect } from 'react';
import { ThemeProvider, SoundsProvider, createTheme, createSounds, Arwes, Button, Heading } from 'arwes';
import WebFont from 'webfontloader';
import { client, getGlobalRoom } from '../client';
import { TaskLoop } from '../task-loop';
import { DashboardWidget } from './dashboard';

WebFont.load({
    custom: {
        families: ['Electrolize', 'Titillium Web'],
    },
});

const InGameMenu = () => {
    const [ships, setShips] = useState<string[]>([]);

    useEffect(() => {
        const loop = new TaskLoop(async () => {
            const rooms = await client.getAvailableRooms('ship');
            setShips(rooms.map((r) => r.roomId));
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
            <li key="Stop Game">
                <Button onClick={async () => (await getGlobalRoom('admin')).send('stopGame', undefined)} animate>
                    Stop Game
                </Button>
            </li>
            <li key="Game Master">
                <Button onClick={() => window.location.assign('gm.html')} animate>
                    Game Master
                </Button>
            </li>
            {[...ships].flatMap((shipId: string) => [
                <li key={`title-ship-${shipId}`}> Ship {shipId}</li>,
                ...[...layouts].map((layout) => (
                    <li key={`ship-${shipId}-layout-${layout}`}>
                        <Button
                            onClick={() => window.location.assign(`ship.html?ship=${shipId}&layout=${layout}`)}
                            animate
                        >
                            {layout}
                        </Button>
                    </li>
                )),
                <li key={`empty-${shipId}`}>
                    <Button onClick={() => window.location.assign(`ship.html?ship=${shipId}`)} animate>
                        Empty Screen
                    </Button>
                </li>,
            ])}
        </ul>
    );
};

export const Lobby = () => {
    const [gamesCount, setgamesCount] = useState(0);

    useEffect(() => {
        const loop = new TaskLoop(async () => {
            const rooms = await client.getAvailableRooms('space');
            setgamesCount(rooms.length);
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
                            {!!gamesCount && (
                                <li key="InGameMenu">
                                    <InGameMenu></InGameMenu>
                                </li>
                            )}
                            {!gamesCount && (
                                <li key="startGame">
                                    <Button
                                        onClick={async () =>
                                            (await getGlobalRoom('admin')).send('startGame', undefined)
                                        }
                                        animate
                                    >
                                        New Game
                                    </Button>
                                </li>
                            )}
                            <li key="input">
                                <Button key="input" onClick={() => window.location.assign('input.html')} animate>
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

export const lobbyWidget: DashboardWidget<Record<string, unknown>> = {
    name: 'lobby',
    type: 'react-component',
    component: Lobby,
    defaultProps: {},
};
