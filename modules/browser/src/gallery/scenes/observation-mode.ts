import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawObservationMode } from '../../widgets/observation-mode';

function scene(name: string, description: string, position: number, duration: number, held: boolean): Scene {
    return {
        name,
        description,
        setup(container: HTMLElement) {
            // taller than the chip so its downward notch is inside the captured box
            const mockContainer = createMockContainer(container, 460, 64);
            container.style.textAlign = 'center';
            drawObservationMode(mockContainer).show({ position, duration, held });
        },
    };
}

export const observationModeScenes: Record<string, Scene> = {
    'observation-mode-start': scene(
        'observation-mode-start',
        'Observation chip at the start of a replay',
        0,
        497,
        false,
    ),
    'observation-mode-midway': scene(
        'observation-mode-midway',
        'Observation chip midway through a replay',
        272,
        497,
        false,
    ),
    'observation-mode-held': scene(
        'observation-mode-held',
        'Observation chip with the replay held (rate 0)',
        497,
        497,
        true,
    ),
};
