import { BroadcastAdmin, drawGmBroadcast } from '../../widgets/gm-broadcast';
import { Scene } from './index';
import { createMockContainer } from '../mocks/container';

/** The admin slice the broadcast blade reads, with no server behind it. */
function mockAdminDriver(texts: string[]): BroadcastAdmin {
    return {
        state: { messageHistory: texts.map((text, i) => ({ seq: i + 1, text })) },
        events: { on: () => undefined, off: () => undefined },
        broadcastMessage: () => undefined,
    };
}

function broadcastScene(name: string, description: string, texts: string[]): Record<string, Scene> {
    return {
        [name]: {
            name,
            description,
            async setup(container: HTMLElement) {
                container.style.background = '#0a0a0a';
                drawGmBroadcast(createMockContainer(container, 420, 240), mockAdminDriver(texts));
                // DOM text lays out again when a web font lands; settle before the gallery measures
                await document.fonts.ready;
            },
        },
    };
}

export const gmBroadcastScenes: Record<string, Scene> = {
    ...broadcastScene('gm-broadcast-empty', 'GM broadcast blade before any message was sent', []),
    ...broadcastScene('gm-broadcast-history', 'GM broadcast blade with the history, newest first', [
        'Welcome aboard, crew.',
        'Station Weapons lost',
        'All hands: brace for impact in 30 seconds',
    ]),
};
