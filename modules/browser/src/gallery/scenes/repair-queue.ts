import { RepairManager, RepairPriority, demoShip, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawRepairQueue } from '../../widgets/repair-queue';

type SlotSetup = { priority: RepairPriority; queuedSeq?: number; progress?: number; refusalReason?: string };

/**
 * The engineer screen's Repair Queue (issue #2434), rendered the way the engineer station shows it:
 * `data-input='none'` + `data-station='engineer'` switch on its compact skin in tweakpane.css.
 * Slot state is written directly — no RepairManager ticks — so every render is identical.
 */
function repairQueueScene(name: string, description: string, slots: Record<string, SlotSetup>): Scene {
    return {
        name,
        description,
        setup(container: HTMLElement) {
            document.body.dataset.input = 'none';
            document.body.dataset.station = 'engineer';
            const ship = makeShipState('player', demoShip);
            // populates one slot per catalog protocol; never updated, so it never schedules anything
            new RepairManager(ship, { drawEnergy: () => 0 }, { addHeat: () => undefined });
            for (const slot of ship.repairQueue.slots) {
                const setup = slots[slot.protocolId];
                if (setup) {
                    slot.priority = setup.priority;
                    slot.queuedSeq = setup.queuedSeq ?? 0;
                    slot.progress = setup.progress ?? 0;
                    slot.refusalReason = setup.refusalReason ?? '';
                }
            }
            const mockContainer = createMockContainer(container, 320, 520);
            drawRepairQueue(mockContainer, createMockShipDriver(ship) as never, false);
            // the panel's own height, so the snapshot holds no empty space below it
            container.style.height = 'auto';
        },
        teardown() {
            delete document.body.dataset.input;
            delete document.body.dataset.station;
        },
    };
}

export const repairQueueScenes: Record<string, Scene> = {
    'repair-queue-empty': repairQueueScene('repair-queue-empty', 'Repair queue with every protocol OFF', {}),
    'repair-queue-running': repairQueueScene('repair-queue-running', 'One protocol RUNNING at 40%', {
        thrustLinePurge: { priority: RepairPriority.RUNNING, queuedSeq: 1, progress: 0.4 },
    }),
    'repair-queue-mixed': repairQueueScene(
        'repair-queue-mixed',
        'One RUNNING plus pending protocols at mixed priorities, with a same-priority tie decided by queue time',
        {
            thrustLinePurge: { priority: RepairPriority.RUNNING, queuedSeq: 1, progress: 0.65 },
            // HIGH tie: sensorArrayDegauss is earlier in the catalog but was queued later, so it runs second
            sensorArrayDegauss: { priority: RepairPriority.HIGH, queuedSeq: 5 },
            powerTrainReset: { priority: RepairPriority.HIGH, queuedSeq: 3 },
            actuatorRecalibration: { priority: RepairPriority.LOW, queuedSeq: 2 },
            fireControlAlignment: { priority: RepairPriority.MEDIUM, queuedSeq: 4 },
        },
    ),
    'repair-queue-refused': repairQueueScene('repair-queue-refused', 'A refused raise shows its reason', {
        armorPlateRenewal: {
            priority: RepairPriority.OFF,
            refusalReason: 'Armor plate renewal requires a higher repair tier than this ship has',
        },
    }),
};
