import * as EssentialsPlugin from '@tweakpane/plugin-essentials';

import { Asteroid, Faction, shipModels } from '@starwards/core';
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
import { createWidgetPane } from '../panel';

export function createWidget(createContainer: InteractiveLayerCommands): DashboardWidget {
    class CreateRoot {
        private pane: Pane;

        constructor(container: WidgetContainer, _: unknown) {
            this.pane = createWidgetPane(container, 'Create Objects').pane;
            this.pane.registerPlugin(EssentialsPlugin);
            // Asteroid
            const makeAsteroidFolder = this.pane.addFolder({
                title: 'Create Asteroid',
                expanded: true,
            });
            const createAsteroidTemplate: CreateAsteroidTemplate = {
                type: 'Asteroid',
                radius: { min: 1, max: Asteroid.maxSize },
            };
            makeAsteroidFolder.addBinding(createAsteroidTemplate, 'radius', {
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
            makeShipFolder.addBinding(createShipTemplate, 'faction', {
                options: Object.values(Faction)
                    .filter<number>((k): k is number => typeof k === 'number')
                    .filter((k) => !String(Faction[k]).endsWith('_COUNT'))
                    .map((value) => ({ value, text: String(Faction[value]) })),
            });
            makeShipFolder.addBinding(createShipTemplate, 'shipModel', {
                options: shipModels.map((sm) => ({ text: sm, value: sm })),
            });
            makeShipFolder.addBinding(createShipTemplate, 'isPlayerShip');
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
            makeExplosionFolder.addBinding(createExplosionTemplate, 'damageFactor', {
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
