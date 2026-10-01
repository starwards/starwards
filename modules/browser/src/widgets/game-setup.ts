import { AdminDriver, GameStatus } from '@starwards/core';
import { addButton, createWidgetPane } from '../panel';
import { handleFile, loadFileAccept } from '../drop-file';

import $ from 'jquery';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';
import fileDownload from 'js-file-download';
import { readProp } from '../property-wrappers';

const saveFileExtension = '.ssg';

/** The maps offered here mirror the lobby's fixed picks (`components/lobby.tsx`) — there is no server endpoint listing available maps yet. */
const MAPS = [
    { label: '2v1 Game', name: 'two_vs_one' },
    { label: 'Solo Game', name: 'solo' },
    { label: 'Wave Defence', name: 'wave_defence' },
];

/**
 * The GM's load/start/stop/save controls (issue #2132) — the same actions the lobby offers, so
 * the GM doesn't need a second tab open just to get a game running before assigning stations.
 */
export function gameSetupWidget(adminDriver: AdminDriver): DashboardWidget {
    class GameSetupComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawGameSetup(container, adminDriver);
        }
    }
    return {
        name: 'game setup',
        type: 'component',
        component: GameSetupComponent,
        defaultProps: {},
    };
}

function saveFileName() {
    const d = new Date();
    return `save_${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}_${d.getHours()}:${d.getMinutes()}${saveFileExtension}`;
}

function drawGameSetup(container: WidgetContainer, adminDriver: AdminDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Game Setup');
    const gameStatus = readProp<GameStatus>(adminDriver, '/gameStatus');

    const stopButton = addButton(
        pane,
        () => adminDriver.stopGame(),
        { label: 'stop', title: 'Stop Game' },
        cleanup.add,
    );
    const saveButton = addButton(
        pane,
        () => void adminDriver.saveGame().then((content) => fileDownload(content, saveFileName())),
        { label: 'save', title: 'Save Game' },
        cleanup.add,
    );
    const startButtons = MAPS.map(({ label, name }) =>
        addButton(pane, () => adminDriver.startGame(name), { label, title: label }, cleanup.add),
    );

    const loadInput = $('<input type="file" data-id="Load Game Input" accept="' + loadFileAccept + '" />').css({
        display: 'block',
        margin: '0.5em 0',
    });
    const loadHint = $('<div>a recording or a saved game — or drop the file anywhere on this page</div>').css({
        fontSize: '0.85em',
        opacity: 0.7,
    });
    const loadNotice = $('<div data-id="load notice"></div>').css({ fontSize: '0.85em', color: '#ff6666' });
    container.getElement().append(loadInput, loadHint, loadNotice);
    loadInput.on('change', () => {
        const file = (loadInput.get(0) as HTMLInputElement).files?.[0];
        if (file) {
            handleFile(file, () => adminDriver, { setNotice: (text) => void loadNotice.text(text) });
        }
        loadInput.val('');
    });
    cleanup.add(() => {
        loadInput.remove();
        loadHint.remove();
        loadNotice.remove();
    });

    const applyMode = () => {
        const stopped = gameStatus.getValue() === GameStatus.STOPPED;
        for (const b of startButtons) {
            b.hidden = !stopped;
        }
        stopButton.disabled = stopped;
        saveButton.disabled = stopped;
    };
    cleanup.add(gameStatus.onChange(applyMode));
    applyMode();
}
