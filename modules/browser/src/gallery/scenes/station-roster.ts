import { RosterAdmin, drawStationRoster } from '../../widgets/station-roster';
import { Scene } from './index';
import { createMockContainer } from '../mocks/container';

type Bot = { brain: string; status: string; message: string };
type Station = { id: string; connected: boolean; shipId: string; stationType: string };

const screens = ['helms', 'weapons', 'engineer', 'signals', 'dradis'];

/** The admin state slice the roster reads, with no server behind it. */
function mockAdminDriver(opts: {
    bots?: Record<string, Bot>;
    stations?: Station[];
    isRecordingGame?: boolean;
}): RosterAdmin {
    const seats = new Map(Object.entries(opts.bots ?? {}));
    const noop = () => undefined;
    return {
        state: {
            playerShipIds: ['GVTS'],
            stations: new Map((opts.stations ?? []).map((s) => [s.id, s])),
            bots: new Map(seats.size ? [['GVTS', { seats }]] : []),
            isRecordingGame: !!opts.isRecordingGame,
        },
        events: { on: noop, off: noop },
        assignBot: noop,
        assignStation: noop,
        resetAssignments: noop,
    };
}

function rosterScene(
    name: string,
    description: string,
    opts: Parameters<typeof mockAdminDriver>[0],
): Record<string, Scene> {
    return {
        [name]: {
            name,
            description,
            async setup(container: HTMLElement) {
                container.style.background = '#0a0a0a';
                drawStationRoster(createMockContainer(container, 520, 260), mockAdminDriver(opts), () => ({
                    getEnabledTypes: () => screens,
                }));
                // DOM text lays out again when a web font lands; settle before the gallery measures
                await document.fonts.ready;
            },
        },
    };
}

const running = { brain: 'reference', status: 'running', message: '' };

export const stationRosterScenes: Record<string, Scene> = {
    ...rosterScene('station-roster-empty', 'GM roster with no clients or bots: every seat unassigned', {}),
    ...rosterScene('station-roster-bots-running', 'Bots seated while the game is recorded; a client on helms', {
        bots: { engineer: running, sigint: running },
        stations: [{ id: 'abc', connected: true, shipId: 'GVTS', stationType: 'helms' }],
        isRecordingGame: true,
    }),
    ...rosterScene('station-roster-failed', 'A failed bot with its error and a restart button', {
        bots: { pilot: { brain: 'reference', status: 'failed', message: 'worker exited' } },
        isRecordingGame: true,
    }),
    ...rosterScene('station-roster-blocked', 'A tactical bot blocks the pilot and weapons bot buttons', {
        bots: { tactical: running },
        isRecordingGame: true,
    }),
    ...rosterScene('station-roster-not-recording', 'Bots running while the game is not recorded: warning banner', {
        bots: { engineer: running },
    }),
};
