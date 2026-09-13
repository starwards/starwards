import { Button } from '../components/arwes-compat';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { hsl } from '../colors';

function WaitingScreen({ stationId, showBreakout }: { stationId: string; showBreakout: boolean }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div
                data-id="station-id"
                style={{ fontSize: '6vw', letterSpacing: '0.1em', fontWeight: 'bold', textTransform: 'uppercase' }}
            >
                {stationId || 'connecting...'}
            </div>
            {showBreakout && (
                <div style={{ marginTop: '1.5em' }}>
                    <Button palette="secondary" onClick={() => window.location.assign('index.html?lobby')}>
                        <div data-id="lobby-breakout">Lobby</div>
                    </Button>
                </div>
            )}
        </div>
    );
}

/**
 * The generic seat's (`station.html`) waiting screen (issue #2242): shown while unassigned, or
 * while assigned but no game/replay is running (see `computeSeatView`). Shows this seat's own id
 * large enough to match against a physical screen, plus — only while wholly unassigned — a
 * breakout button back to the manual lobby (`index.html?lobby`). The id itself is not editable
 * here; it stays whatever `getOrCreateStationId` resolved for this tab.
 */
export function renderWaitingScreen(
    element: JQuery<HTMLElement>,
    stationId: string,
    showBreakout: boolean,
): () => void {
    element.attr('data-id', 'Waiting Screen').css({
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: hsl.background,
        color: hsl.primary.main(3),
        fontFamily: 'sans-serif',
    });
    const root = createRoot(element[0]);
    root.render(<WaitingScreen stationId={stationId} showBreakout={showBreakout} />);
    return () => root.unmount();
}
