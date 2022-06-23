import { Destructor, Destructors, ShipDirection, SpaceObject, Spaceship } from '@starwards/model';
import { Driver, SpaceDriver } from '../driver';
import { FolderApi, Pane } from 'tweakpane';
import { addInputBlade, addSliderBlade, addTextBlade } from '../panel';

import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { SelectionContainer } from '../radar/selection-container';
import pluralize from 'pluralize';

const selectionTitle = (selected: Iterable<SpaceObject>) => {
    const counts = {} as Record<SpaceObject['type'], number>;
    for (const { type } of selected) {
        counts[type] = (counts[type] || 0) + 1;
    }
    const message = Object.entries(counts)
        .map(([type, count]) => pluralize(type, count, true))
        .join(', ');
    return `${message || 'None'} Selected`;
};

const singleSelectionDetails = async (
    subject: SpaceObject,
    driver: Driver,
    spaceDriver: SpaceDriver,
    guiFolder: FolderApi,
    cleanup: (d: Destructor) => void
) => {
    const api = spaceDriver.getObjectApi(subject.id);
    guiFolder.addInput(subject, 'id', { disabled: true });
    addInputBlade(guiFolder, api.freeze, { label: 'Freeze' }, cleanup);

    if (Spaceship.isInstance(subject)) {
        const shipDriver = await driver.getShipDriver(subject.id);
        const armorFolder = guiFolder.addFolder({
            title: `Armor`,
            expanded: false,
        });
        cleanup(() => {
            armorFolder.dispose();
        });
        addTextBlade<ShipDirection>(
            armorFolder,
            shipDriver.armor.numPlates,
            {
                label: 'Plates',
                disabled: true,
            },
            cleanup
        );
        addTextBlade<ShipDirection>(
            armorFolder,
            shipDriver.armor.numHealthyPlates,
            {
                label: 'Healthy Plates',
                disabled: true,
            },
            cleanup
        );
        for (const thruster of shipDriver.thrusters) {
            const thrusterFolder = guiFolder.addFolder({
                title: `Thruster ${thruster.index} (${ShipDirection[thruster.angle.getValue()]})`,
                expanded: false,
            });
            cleanup(() => {
                thrusterFolder.dispose();
            });
            addSliderBlade(
                thrusterFolder,
                thruster.angleError,
                {
                    label: 'Angle Error',
                },
                cleanup
            );
            addSliderBlade(
                thrusterFolder,
                thruster.availableCapacity,
                {
                    label: 'Available Capacity',
                },
                cleanup
            );
        }
    }
};

export function tweakWidget(driver: Driver, selectionContainer: SelectionContainer): DashboardWidget {
    class TweakRoot {
        private pane: Pane;
        private selectionCleanup = new Destructors();
        private spaceDriver: SpaceDriver | null = null;
        private panelCleanup = new Destructors();

        constructor(container: Container, _: unknown) {
            this.pane = new Pane({ container: container.getElement().get(0) });
            this.panelCleanup.add(() => {
                this.pane.dispose();
            });
            container.on('destroy', this.panelCleanup.destroy);
            void this.init();
        }

        // the async part of initializing
        private async init() {
            const [spaceDriver, _adminDriver] = await Promise.all([driver.getSpaceDriver(), driver.getAdminDriver()]);
            this.spaceDriver = spaceDriver;
            this.panelCleanup.add(() => {
                selectionContainer.events.removeListener('changed', this.handleSelectionChange);
            });
            selectionContainer.events.addListener('changed', this.handleSelectionChange);
            this.handleSelectionChange();
        }

        private handleSelectionChange = () => {
            this.selectionCleanup.cleanup();
            const guiFolder = this.pane.addFolder({
                title: selectionTitle(selectionContainer.selectedItems),
                expanded: true,
            });
            this.selectionCleanup.add(() => {
                guiFolder.dispose();
            });
            if (this.spaceDriver) {
                for (const subject of selectionContainer.selectedItems) {
                    const itemFolder = guiFolder.addFolder({
                        title: `${subject.type} ${subject.id}`,
                        expanded: selectionContainer.selectedItems.size === 1,
                    });
                    this.selectionCleanup.add(() => {
                        itemFolder.dispose();
                    });
                    void singleSelectionDetails(
                        subject,
                        driver,
                        this.spaceDriver,
                        itemFolder,
                        this.selectionCleanup.add
                    );
                }
            }
        };
    }

    return {
        name: 'tweak',
        type: 'component',
        component: TweakRoot,
        defaultProps: {},
    };
}
