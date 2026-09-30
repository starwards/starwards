import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawObservationMode } from '../../widgets/observation-mode';

export const observationModeScenes: Record<string, Scene> = {
    'observation-mode-recording': {
        name: 'observation-mode-recording',
        description: "The GM's chip while recording a live game",
        setup(container: HTMLElement) {
            // taller than the chip so its downward notch is inside the captured box
            const mockContainer = createMockContainer(container, 460, 64);
            container.style.textAlign = 'center';
            drawObservationMode(mockContainer).show({
                position: 134,
                held: false,
                label: 'REC',
                mode: 'two_vs_one_1754651000000.sgr',
            });
        },
    },
};
