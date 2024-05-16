import * as EssentialsPlugin from '@tweakpane/plugin-essentials';

import { Asteroid, Destructors, Faction, shipModels } from '@starwards/core';
import {
    CreateAsteroidTemplate,
    CreateExplosionTemplate,
    CreateSpaceshipTemplate,
    CreateWaypointTemplate,
    InteractiveLayerCommands,
} from '../radar/interactive-layer-commands';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { WidgetContainer } from '../container';

export function createWidget(createContainer: InteractiveLayerCommands): DashboardWidget {
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
                ...createAsteroidTemplate.radius,
                step: 1,
            });
            makeAsteroidFolder
                .addButton({ title: 'Create Asteroid' })
                .on('click', () => createContainer.createByTemplate(createAsteroidTemplate));

            // Spaceship
            const makeShipFolder = this.pane.addFolder({
                title: 'Create Ship',
                expanded: true,
            });
            const createShipTemplate: CreateSpaceshipTemplate = {
                type: 'Spaceship',
                isPlayerShip: false,
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
            makeShipFolder.addInput(createShipTemplate, 'isPlayerShip');
            makeShipFolder
                .addButton({ title: 'Create Ship' })
                .on('click', () => createContainer.createByTemplate(createShipTemplate));

            // Explosion
            const makeExplosionFolder = this.pane.addFolder({
                title: 'Create Explosion',
                expanded: true,
            });
            const createExplosionTemplate: CreateExplosionTemplate = {
                type: 'Explosion',
                damageFactor: { min: 1, max: 1_000 },
            };
            makeExplosionFolder.addInput(createExplosionTemplate, 'damageFactor', {
                ...createExplosionTemplate.damageFactor,
                step: 1,
            });
            makeExplosionFolder
                .addButton({ title: 'Create Explosion' })
                .on('click', () => createContainer.createByTemplate(createExplosionTemplate));

            // Waypoint
            const makeWaypointFolder = this.pane.addFolder({
                title: 'Create Waypoint',
                expanded: true,
            });
            const createWaypointTemplate: CreateWaypointTemplate = {
                type: 'Waypoint',
            };

            makeWaypointFolder
                .addButton({ title: 'Create Waypoint' })
                .on('click', () => createContainer.createByTemplate(createWaypointTemplate));
        }
    }

    return {
        name: 'create',
        type: 'component',
        component: CreateRoot,
        defaultProps: {},
    };
}
