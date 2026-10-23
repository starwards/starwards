import { Faction, ScanLevel, demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';
import { createMockShip, createMockSpaceDriver } from '../mocks/space-driver';

import { Scene } from './index';
import { SelectionContainer } from '../../radar/selection-container';
import { createMockContainer } from '../mocks/container';
import { drawTargetInfo } from '../../widgets/target-info';
import { settle } from '../mocks/fixtures';

function targetInfoScene(name: string, description: string, scanLevel: ScanLevel | null): Scene {
    return {
        name,
        description,
        async setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            const target = createMockShip({
                id: 'contact-7',
                position: { x: 3000, y: 4000 },
                faction: Faction.Raiders,
            });
            target.model = 'dragonfly-MK1';
            if (scanLevel !== null) {
                target.scanLevels[ship.faction] = scanLevel;
            }
            const spaceDriver = createMockSpaceDriver([ship.spaceship, target]);
            const selection = new SelectionContainer();
            if (scanLevel !== null) {
                selection.set([target]);
            }
            drawTargetInfo(
                createMockContainer(container, 300, 260),
                spaceDriver as never,
                snapshotShipDriver(ship),
                selection,
            );
            await settle();
        },
    };
}

export const targetInfoScenes: Record<string, Scene> = {
    'target-info-no-target': targetInfoScene('target-info-no-target', 'Contact panel with nothing selected', null),
    'target-info-unscanned': targetInfoScene(
        'target-info-unscanned',
        'Contact panel on an unscanned contact: type and faction withheld',
        ScanLevel.UFO,
    ),
    'target-info-scanned': targetInfoScene(
        'target-info-scanned',
        'Contact panel on a contact scanned to BASIC: type and faction shown',
        ScanLevel.BASIC,
    ),
};
