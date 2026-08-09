import { ObservationView, drawObservationMode } from '../../widgets/observation-mode';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';

function scene(name: string, description: string, view: ObservationView): Scene {
    return {
        name,
        description,
        setup(container: HTMLElement) {
            // taller than the chip so its downward notch is inside the captured box
            const mockContainer = createMockContainer(container, 460, 64);
            container.style.textAlign = 'center';
            drawObservationMode(mockContainer).show(view);
        },
    };
}

export const observationModeScenes: Record<string, Scene> = {
    'observation-mode-start': scene('observation-mode-start', 'Observation chip at the start of a replay', {
        position: 0,
        duration: 497,
        held: false,
    }),
    'observation-mode-midway': scene('observation-mode-midway', 'Observation chip midway through a replay', {
        position: 272,
        duration: 497,
        held: false,
    }),
    'observation-mode-held': scene('observation-mode-held', 'Observation chip with the replay held (rate 0)', {
        position: 497,
        duration: 497,
        held: true,
    }),
    'observation-mode-ended': scene('observation-mode-ended', 'Observation chip once the replay ran to its end', {
        position: 497,
        duration: 497,
        held: true,
        holdText: 'ENDED',
    }),
    'observation-mode-recording': scene('observation-mode-recording', "The GM's chip while recording a live game", {
        position: 134,
        duration: 0,
        held: false,
        label: 'REC',
        mode: 'two_vs_one_1754651000000.swr.jsonl',
    }),
};
