import { type InputDescription, InputManager } from './input-manager';
import hotkeys, { type KeyHandler } from 'hotkeys-js';

import { HotkeyHelpModal } from '../components/hotkey-help-modal';
import React from 'react';
import { createRoot } from 'react-dom/client';

export function setupHotkeyHelp(...inputManagers: InputManager[]): () => void {
    const container = document.createElement('div');
    container.id = 'hotkey-help-root';
    document.body.appendChild(container);

    const root = createRoot(container);
    let visible = false;

    function render() {
        const descriptions: InputDescription[] = inputManagers.flatMap((im) => im.getInputDescriptions());
        descriptions.push({ input: 'SPACE', label: 'Show this help', inputType: 'keyboard' });
        root.render(React.createElement(HotkeyHelpModal, { descriptions, visible, onClose: toggle }));
    }

    function toggle() {
        visible = !visible;
        render();
    }

    const onSpace: KeyHandler = (e) => {
        e.preventDefault();
        toggle();
    };
    hotkeys('space', onSpace);

    render();

    return () => {
        hotkeys.unbind('space', onSpace);
        root.unmount();
        container.remove();
    };
}
