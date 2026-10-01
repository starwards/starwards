import { AdminDriver, Driver, StationRegistration, VERSION } from '@starwards/core';
import { ArwesThemeProvider, Button, Card, StylesBaseline, Text } from './arwes-compat';
import { beginStationRegistrationWithRetry, getOrCreateStationId } from '../station-identity';
import { handleFile, installFileDrop, loadFileAccept } from '../drop-file';
import { useAdminDriver, useCanStartGame, useIsGameRunning, useIsRecording, usePlayerShips } from '../react/hooks';

import { AnimatorGeneralProvider } from './arwes-compat';
import { BleepsProvider } from './arwes-compat';
import { NetworkInfoPanel } from './network-info-panel';
import { REVIEWER_GUIDE_URL } from '../lobby-links';
import React from 'react';
import { RecordingsMenu } from './recordings-menu';
import WebFont from 'webfontloader';
import { useSaveGameHandler } from './save-load-game';

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

/** The station links. */
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

/** Opens a file picker for a recording or a saved game: the same files, and the same result, as dropping one. */
const LoadButton = ({ onFile }: { onFile: (file: File) => void }) => {
    const input = React.useRef<HTMLInputElement>(null);
    return (
        <>
            <input
                ref={input}
                type="file"
                accept={loadFileAccept}
                data-id="load file input"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onFile(file);
                }}
            />
            <Button palette="primary" onClick={() => input.current?.click()}>
                <div data-id="load">Load</div>
            </Button>
        </>
    );
};

const InGameMenu = (p: Props & { onLoadFile: (file: File) => void }) => {
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
                    <LoadButton onFile={p.onLoadFile} />
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
                        key={`helms-${shipId}`}
                        palette="primary"
                        onClick={() => window.location.assign(`helms.html?ship=${shipId}`)}
                    >
                        Helms
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
                        key={`dradis-${shipId}`}
                        palette="primary"
                        onClick={() => window.location.assign(`dradis.html?ship=${shipId}`)}
                    >
                        Dradis
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

/** A recording or saved game dropped anywhere on the lobby (see `installFileDrop`). */
function useDropFile(adminDriver: AdminDriver | null) {
    const [dragging, setDragging] = React.useState(false);
    const [notice, setNotice] = React.useState('');
    const latest = React.useRef(adminDriver);
    latest.current = adminDriver;
    React.useEffect(() => installFileDrop(() => latest.current, { setDragging, setNotice }), []);
    const loadFile = React.useCallback((file: File) => handleFile(file, () => latest.current, { setNotice }), []);
    return { dragging, notice, loadFile };
}

export const Lobby = (p: Props) => {
    const isGameRunning = useIsGameRunning(p.driver);
    const canStartGame = useCanStartGame(p.driver);
    const adminDriver = useAdminDriver(p.driver);
    const { dragging, notice, loadFile } = useDropFile(adminDriver);
    return (
        <ArwesThemeProvider>
            <StylesBaseline styles={{ body: { fontFamily: 'Electrolize' } }} />
            <BleepsProvider
                audioSettings={audioSettings}
                playersSettings={playersSettings}
                bleepsSettings={bleepsSettings}
            >
                <AnimatorGeneralProvider animator={generalAnimator}>
                    {dragging && (
                        <div
                            data-id="drop overlay"
                            style={{
                                position: 'fixed',
                                inset: 0,
                                zIndex: 1000,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '4px dashed #00d7ff',
                                background: 'rgba(0, 0, 0, 0.7)',
                                fontSize: 32,
                                pointerEvents: 'none',
                            }}
                        >
                            Drop a recording to play it, or a saved game to load it
                        </div>
                    )}
                    {notice && (
                        <div data-id="drop notice" style={{ textAlign: 'center', color: '#ff6666', padding: 8 }}>
                            {notice}
                        </div>
                    )}
                    <div style={{ padding: 20, textAlign: 'center' }}>
                        <StationIdBadge driver={p.driver} adminDriver={adminDriver} />
                        <h1 data-id="title">Starwards</h1>
                        {isGameRunning && adminDriver && (
                            <InGameMenu driver={p.driver} onLoadFile={loadFile}></InGameMenu>
                        )}
                        {isGameRunning && adminDriver && <StationsMenu driver={p.driver} />}
                        {canStartGame && adminDriver && (
                            <pre key="2V1 game">
                                <Button palette="success" onClick={() => adminDriver.startGame('two_vs_one')}>
                                    <div data-id="new game">2v1 Game</div>
                                </Button>
                                <Button palette="success" onClick={() => adminDriver.startGame('solo')}>
                                    <div>Solo Game</div>
                                </Button>
                                <Button palette="success" onClick={() => adminDriver.startGame('wave_defence')}>
                                    <div data-id="wave defence game">Wave Defence</div>
                                </Button>
                                <LoadButton onFile={loadFile} />
                                <RecordingsMenu adminDriver={adminDriver} />
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
                            <Button
                                key="player"
                                palette="secondary"
                                onClick={() => window.location.assign('player.html')}
                            >
                                Recording Player
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
