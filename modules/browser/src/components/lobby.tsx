import { ArwesThemeProvider, Button, Card, StylesBaseline, Text } from '@arwes/core';
import { LoadGame, useSaveGameHandler } from './save-load-game';
import { useAdminDriver, useIsGameRunning, useShips } from '../react/hooks';

import { AnimatorGeneralProvider } from '@arwes/animation';
import { BleepsProvider } from '@arwes/sounds';
import { Driver } from '@starwards/model';
import React from 'react';
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
    const ships = useShips(p.driver);
    const adminDriver = useAdminDriver(p.driver);
    const saveGame = useSaveGameHandler(adminDriver);
    return (
        <>
            {adminDriver && (
                <pre key="Stop Game">
                    <Button palette="error" onClick={adminDriver?.stopGame}>
                        <div data-id="stop game">Stop Game</div>
                    </Button>
                    <Button palette="success" onClick={saveGame}>
                        <div data-id="save game">Save Game</div>
                    </Button>
                </pre>
            )}
            <Card
                key="Game Master"
                title="Game Master"
                image={{
                    src: '/images/photos/nebula.jpg',
                }}
                options={
                    <Button key="Game Master" onClick={() => window.location.assign(`gm.html`)}>
                        Game Master
                    </Button>
                }
                style={{ maxWidth: 400, display: 'inline-block', padding: '10px' }}
                hover
            >
                Manage the game
            </Card>
            {[...ships].flatMap((shipId: string) => (
                <ShipOptions key={`ship-${shipId}`} shipId={shipId} />
            ))}
        </>
    );
};

function ShipOptions({ shipId }: { shipId: string }) {
    const layouts = new Set<string>();
    for (const key in localStorage) {
        if (key.startsWith('layout:')) {
            layouts.add(key.substring('layout:'.length));
        }
    }
    return (
        <Card
            image={{
                src: '/images/photos/fighter-2.png',
            }}
            title={`Ship ${shipId}`}
            options={
                <>
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
                    <Button
                        key="3D debug"
                        palette="secondary"
                        onClick={() => window.location.assign(`main-screen.html?ship=${shipId}&debug`)}
                    >
                        3D debug
                    </Button>
                    <Button
                        key="Main Screen"
                        palette="secondary"
                        onClick={() => window.location.assign(`main-screen.html?ship=${shipId}`)}
                    >
                        Main Screen
                    </Button>
                </>
            }
            style={{ maxWidth: 400, display: 'inline-block', padding: '10px' }}
            hover
        >
            <Text>Play as a fighter ship</Text>
        </Card>
    );
}

export const Lobby = (p: Props) => {
    const isGameRunning = useIsGameRunning(p.driver);
    const adminDriver = useAdminDriver(p.driver);

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
                        <h1 data-id="title">Starwards</h1>
                        {isGameRunning && adminDriver && <InGameMenu driver={p.driver}></InGameMenu>}

                        {false === isGameRunning && adminDriver && (
                            <pre key="new game">
                                <LoadGame adminDriver={adminDriver} />
                                <br />

                                <Button palette="success" onClick={() => adminDriver.startGame('two_vs_one')}>
                                    <div data-id="new game">New Game</div>
                                </Button>
                            </pre>
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

type Props = { driver: Driver };
