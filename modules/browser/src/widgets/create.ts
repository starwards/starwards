import * as EssentialsPlugin from '@tweakpane/plugin-essentials';

import { Asteroid, Destructors, Faction, shipModels } from '@starwards/core';
import {
    CreateAsteroidTemplate,
    CreateObjectsContainer,
    CreateSpaceshipTemplate,
} from '../radar/create-objects-container';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { WidgetContainer } from '../container';

export function createWidget(createContainer: CreateObjectsContainer): DashboardWidget {
    class CreateRoot {
        private pane: Pane;
        private panelCleanup = new Destructors();

        constructor(container: WidgetContainer, _: unknown) {
            this.pane = new Pane({ container: container.getElement().get(0) });
            this.pane.registerPlugin(EssentialsPlugin);

            this.panelCleanup.add(() => {
                this.pane.dispose();
            });
            container.on('destroy', this.panelCleanup.destroy);
            // Asteroid
            const makeAsteroidFolder = this.pane.addFolder({
                title: 'Create Asteroid',
                expanded: true,
            });
            const createAsteroidTemplate: CreateAsteroidTemplate = {
                type: 'Asteroid',
                radius: { min: 1, max: Asteroid.maxSize },
            };
            makeAsteroidFolder.addInput(createAsteroidTemplate, 'radius', {
                min: 1,
                max: Asteroid.maxSize,
                step: 1,
            });
            makeAsteroidFolder
                .addButton({ title: 'Create Asteroid' })
                .on('click', () => createContainer.createAsteroid(createAsteroidTemplate));

            // Spaceship
            const makeShipFolder = this.pane.addFolder({
                title: 'Create Ship',
                expanded: true,
            });
            const createShipTemplate: CreateSpaceshipTemplate = {
                type: 'Spaceship',
                shipModel: 'dragonfly-SF22',
                faction: Faction.NONE,
            };
            makeShipFolder.addInput(createShipTemplate, 'faction', {
                options: Object.values(Faction)
                    .filter<number>((k): k is number => typeof k === 'number')
                    .filter((k) => !String(Faction[k]).endsWith('_COUNT'))
                    .map((value) => ({ value, text: String(Faction[value]) })),
            });
            makeShipFolder.addInput(createShipTemplate, 'shipModel', {
                options: shipModels.map((sm) => ({ text: sm, value: sm })),
            });
            makeShipFolder
                .addButton({ title: 'Create Ship' })
                .on('click', () => createContainer.createSpaceship(createShipTemplate));
        }
    }

    return {
        name: 'create',
        type: 'component',
        component: CreateRoot,
        defaultProps: {},
    };
}
