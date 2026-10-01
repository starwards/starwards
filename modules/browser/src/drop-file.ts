import { AdminDriver, GameStatus } from '@starwards/core';
import { stashRecording } from './replay/recording-handoff';

const recordingFileExtension = '.sgr';
export const savedGameFileExtension = '.ssg';

type DropUi = {
    setDragging(dragging: boolean): void;
    setNotice(notice: string): void;
};

/**
 * A file dropped anywhere on a page: a recording plays in the recording player, a saved game is
 * loaded (only while no game is running — loading replaces the game). Lobby and GM screen share it,
 * so the same drop does the same thing in both.
 */
export function installFileDrop(getAdminDriver: () => AdminDriver | null, ui: DropUi): () => void {
    const hasFile = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const onDragOver = (e: DragEvent) => {
        if (!hasFile(e)) return;
        e.preventDefault();
        ui.setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
        // leaving the window, not moving between elements
        if (!e.relatedTarget) ui.setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
        if (!hasFile(e)) return;
        e.preventDefault();
        ui.setDragging(false);
        ui.setNotice('');
        const file = e.dataTransfer?.files[0];
        if (!file) return;
        if (file.name.endsWith(recordingFileExtension)) {
            void file
                .text()
                .then((text) => stashRecording({ name: file.name, text }))
                .then(() => window.location.assign('player.html?handoff'));
        } else if (file.name.endsWith(savedGameFileExtension)) {
            const adminDriver = getAdminDriver();
            if (adminDriver?.state.gameStatus !== GameStatus.STOPPED) {
                ui.setNotice('Stop the running game before loading a saved game.');
                return;
            }
            void file.text().then((text) => {
                adminDriver.loadGame(text);
                ui.setNotice(`Loading ${file.name}…`);
            });
        } else {
            ui.setNotice(`Drop a ${recordingFileExtension} recording or a ${savedGameFileExtension} saved game.`);
        }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
        window.removeEventListener('dragover', onDragOver);
        window.removeEventListener('dragleave', onDragLeave);
        window.removeEventListener('drop', onDrop);
    };
}

const OVERLAY_TEXT = 'Drop a recording to play it, or a saved game to load it';

/** Plain-DOM drop overlay and notice, for screens that are not React (the GM dashboard). */
export function mountDropUi(): { ui: DropUi; destroy: () => void } {
    const overlay = document.createElement('div');
    overlay.dataset.id = 'drop overlay';
    overlay.textContent = OVERLAY_TEXT;
    overlay.style.cssText =
        'position: fixed; inset: 0; z-index: 1000; display: none; align-items: center; justify-content: center;' +
        ' border: 4px dashed #00d7ff; background: rgba(0, 0, 0, 0.7); color: #fff; font-size: 32px; pointer-events: none;';
    const notice = document.createElement('div');
    notice.dataset.id = 'drop notice';
    notice.style.cssText =
        'position: fixed; top: 0; left: 50%; transform: translateX(-50%); z-index: 1001; padding: 8px 16px;' +
        ' background: #222; color: #ff6666; display: none; pointer-events: none;';
    document.body.append(overlay, notice);
    return {
        ui: {
            setDragging(dragging) {
                overlay.style.display = dragging ? 'flex' : 'none';
            },
            setNotice(text) {
                notice.textContent = text;
                notice.style.display = text ? 'block' : 'none';
            },
        },
        destroy() {
            overlay.remove();
            notice.remove();
        },
    };
}
