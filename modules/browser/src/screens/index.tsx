import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ThemeProvider, SoundsProvider, createTheme, createSounds, Arwes, Button, Heading } from 'arwes';
import WebFont from 'webfontloader';
import { client } from '../client';
import { TaskLoop } from '../task-loop';

WebFont.load({
    custom: {
        families: ['Electrolize', 'Titillium Web'],
    },
});

const InGameMenu = () => {
    return (
        <ul>
            <li>
                <Button key="pb" onClick={() => window.location.assign('player')} animate>
                    Player Screen
                </Button>
            </li>
            <li>
                <Button key="gmb" onClick={() => window.location.assign('gm')} animate>
                    GM Screen
                </Button>
            </li>
        </ul>
    );
};

const App = () => {
    // Declare a new state variable, which we'll call "count"
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
                        <Heading animate>
                            <p>Starwards</p>
                        </Heading>
                        {gamesCount ? (
                            <InGameMenu></InGameMenu>
                        ) : (
                            <Button onClick={() => client.create('space')} animate>
                                New Game
                            </Button>
                        )}
                    </div>
                </Arwes>
            </SoundsProvider>
        </ThemeProvider>
    );
};

ReactDOM.render(<App />, document.querySelector('#wrapper'));
