import { AdminDriver, Driver, StationRegistration, VERSION } from '@starwards/core';
import { ArwesThemeProvider, Button, Card, StylesBaseline, Text } from './arwes-compat';
import { LoadGame, useSaveGameHandler } from './save-load-game';
import { beginStationRegistrationWithRetry, getOrCreateStationId } from '../station-identity';
import {
    useAdminDriver,
    useCanStartGame,
    useIsGameRunning,
    useIsRecording,
    useIsReplaying,
    usePlayerShips,
} from '../react/hooks';

import { AnimatorGeneralProvider } from './arwes-compat';
import { BleepsProvider } from './arwes-compat';
import { NetworkInfoPanel } from './network-info-panel';
import { REVIEWER_GUIDE_URL } from '../lobby-links';
import React from 'react';
import { ReplayMenu } from './replay-menu';
import WebFont from 'webfontloader';

/**
 * Shows this device's persistent station registry id (assigned by `getOrCreateStationId`, not
 * user-editable — issue #2242 review). Registers on the admin room with no station type/ship —
 * the lobby is where a device sits before it picks a bridge seat, not a seat itself (issue #2131).
 * The server can still force a fresh id on a collision (two tabs racing to the same generated id);
 * `registerAs` reacts to that by generating a genuinely fresh one (see
 * `beginStationRegistrationWithRetry`).
 */
const StationIdBadge = ({ driver, adminDriver }: { driver: Driver; adminDriver: AdminDriver | null }) => {
    const [stationId, setStationIdState] = React.useState(getOrCreateStationId);
    const registrationRef = React.useRef<StationRegistration | null>(null);

    React.useEffect(() => {
        if (!adminDriver) {
            return;
        }
        registrationRef.current?.dispose();
        registrationRef.current = beginStationRegistrationWithRetry(driver, '', '', setStationIdState);
        return () => registrationRef.current?.dispose();
    }, [adminDriver, driver]);

    return (
        <div style={{ marginBottom: 16 }}>
            <div data-id="station-id" style={{ fontSize: 32, letterSpacing: 6, fontWeight: 'bold' }}>
                {stationId}
            </div>
        </div>
    );
};

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

/**
 * The station links. Offered during a replay too — watching a recorded session from a bridge
 * station is the point of a replay, and the server drops those stations' commands while it runs.
 */
const StationsMenu = (p: Props) => {
    const ships = usePlayerShips(p.driver);
    return (
        <>
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

const InGameMenu = (p: Props) => {
    const adminDriver = useAdminDriver(p.driver);
    const saveGame = useSaveGameHandler(adminDriver);
    const isRecording = useIsRecording(adminDriver);
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
                    {isRecording && <div data-id="recording-note">Recording</div>}
                </pre>
            )}
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
                        key={`weapons-${shipId}`}
                        palette="primary"
                        onClick={() => window.location.assign(`weapons.html?ship=${shipId}`)}
                    >
                        Weapons
                    </Button>
                    <Button
                        key={`pilot-${shipId}`}
                        palette="primary"
                        onClick={() => window.location.assign(`pilot.html?ship=${shipId}`)}
                    >
                        Pilot
                    </Button>
                    <Button
                        key={`engineer-${shipId}`}
                        palette="primary"
                        onClick={() => window.location.assign(`engineer.html?ship=${shipId}`)}
                    >
                        Engineer
                    </Button>
                    <Button
                        key={`signals-${shipId}`}
                        palette="primary"
                        onClick={() => window.location.assign(`signals.html?ship=${shipId}`)}
                    >
                        Signals
                    </Button>
                    <Button
                        key={`relay-${shipId}`}
                        palette="primary"
                        onClick={() => window.location.assign(`relay.html?ship=${shipId}`)}
                    >
                        Relay
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
    const isReplaying = useIsReplaying(p.driver);
    const canStartGame = useCanStartGame(p.driver);
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
                        <StationIdBadge driver={p.driver} adminDriver={adminDriver} />
                        <h1 data-id="title">Starwards</h1>
                        {isGameRunning && adminDriver && <InGameMenu driver={p.driver}></InGameMenu>}
                        {isReplaying && adminDriver && (
                            <pre key="Replaying">
                                <div data-id="replaying-note">Replaying</div>
                                <Button palette="error" onClick={adminDriver.stopGame}>
                                    <div data-id="stop replay">Stop</div>
                                </Button>
                            </pre>
                        )}
                        {(isGameRunning || isReplaying) && adminDriver && <StationsMenu driver={p.driver} />}
                        {canStartGame && adminDriver && (
                            <pre key="2V1 game">
                                <LoadGame adminDriver={adminDriver} />
                                <br />

                                <Button palette="success" onClick={() => adminDriver.startGame('two_vs_one')}>
                                    <div data-id="new game">2v1 Game</div>
                                </Button>
                                <Button palette="success" onClick={() => adminDriver.startGame('solo')}>
                                    <div>Solo Game</div>
                                </Button>
                                <Button palette="success" onClick={() => adminDriver.startGame('wave_defence')}>
                                    <div data-id="wave defence game">Wave Defence</div>
                                </Button>
                                <ReplayMenu adminDriver={adminDriver} />
                            </pre>
                        )}
                        <NetworkInfoPanel driver={p.driver} />
                        <pre key="Utilities">
                            <h2>Utilities</h2>
                            <Button
                                key="generic-seat"
                                palette="secondary"
                                onClick={() => window.location.assign('station.html')}
                            >
                                Generic Seat
                            </Button>
                            <Button
                                key="input"
                                palette="secondary"
                                onClick={() => window.location.assign('input.html')}
                            >
                                Input
                            </Button>
                            <Button
                                key="colyseus-monitor"
                                palette="secondary"
                                onClick={() => window.location.assign('colyseus-monitor')}
                            >
                                Colyseus Monitor
                            </Button>
                            <Button
                                key="gallery"
                                palette="secondary"
                                onClick={() => window.location.assign('gallery.html')}
                            >
                                Widgets Gallery
                            </Button>
                        </pre>
                    </div>
                    <div
                        data-id="footer"
                        style={{ position: 'fixed', bottom: 4, right: 8, fontSize: 12, opacity: 0.6 }}
                    >
                        <a data-id="reviewer-guide-link" href={REVIEWER_GUIDE_URL} target="_blank" rel="noreferrer">
                            Testing this build? Read the reviewer guide
                        </a>
                        {' — '}
                        <span data-id="version">v{VERSION}</span>
                    </div>
                </AnimatorGeneralProvider>
            </BleepsProvider>
        </ArwesThemeProvider>
    );
};

type Props = { driver: Driver };
