import { Destructor, Destructors, ShipDirection, SpaceObject, Spaceship } from '@starwards/model';
import { Driver, SpaceDriver } from '../driver';
import { FolderApi, InputParams, ListApi, ListBladeParams, Pane, TextApi, TextBladeParams } from 'tweakpane';

import { BaseEventsApi } from '../driver/utils';
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
    guiFolder.addInput(subject, 'id', { disabled: true });
    addInput(
        guiFolder,
        subject,
        'freeze',
        {},
        (_newValue: boolean) => spaceDriver.commandToggleFreeze({ ids: [subject.id] }),
        spaceDriver,
        cleanup
    );

    if (Spaceship.isInstance(subject)) {
        const shipDriver = await driver.getShipDriver(subject.id);
        addTextBlade<ShipDirection>(
            guiFolder,
            shipDriver.armor.numPlates,
            {
                label: 'Plates',
                disabled: true,
            },
            cleanup
        );
        addTextBlade<ShipDirection>(
            guiFolder,
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
                expanded: true,
            });
            cleanup(() => {
                thrusterFolder.dispose();
            });
            addTextBlade<ShipDirection>(
                thrusterFolder,
                thruster.angle,
                {
                    label: 'Direction',
                    format: (v) => ShipDirection[v],
                    disabled: true,
                },
                cleanup
            );
        }
    }
};

function addTextBlade<T>(
    guiFolder: FolderApi,
    api: BaseEventsApi<T>,
    params: Partial<TextBladeParams<T>>, // { label: string; parse: (v: T) => string },
    cleanup: (d: Destructor) => void
) {
    const guiController = guiFolder.addBlade({
        parse: (v: T) => String(v), // should be from string to T...
        ...params,
        view: 'text',
        value: api.getValue(),
    }) as TextApi<T>;
    guiController.on('change', (e) => {
        api.setValue(e.value);
    });
    const removeStateListener = api.onChange(() => {
        guiController.value = api.getValue();
    });
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
}

// options: ShipDirections.map((value) => ({ value, text: ShipDirection[value] }))
function addEnumListBlade<T>(
    guiFolder: FolderApi,
    api: BaseEventsApi<T>,
    params: Partial<ListBladeParams<T>>, // { label: string; parse: (v: T) => string },
    cleanup: (d: Destructor) => void
) {
    let lastValue = api.getValue();
    const guiController = guiFolder.addBlade({
        parse: (v: T) => String(v), // should be from string to T...
        options: [],
        ...params,
        view: 'list',
        value: lastValue,
    }) as ListApi<T>;
    guiController.on('change', (e) => {
        const newValue = e.value;
        if (newValue !== lastValue) {
            api.setValue(newValue);
        }
    });
    const removeStateListener = api.onChange(() => {
        const newValue = api.getValue();
        if (newValue !== lastValue) {
            lastValue = newValue;
            guiController.value = newValue;
        }
    });
    cleanup(() => {
        guiController.dispose();
        removeStateListener();
    });
}

function addInput<K extends keyof SpaceObject>(
    guiFolder: FolderApi,
    subject: SpaceObject,
    propertyName: K,
    params: InputParams,
    setValue: (_newValue: SpaceObject[K]) => void,
    spaceDriver: SpaceDriver,
    cleanup: (d: Destructor) => void
) {
    const guiController = guiFolder.addInput(subject, propertyName, params);
    let lastValue = subject[propertyName];
    guiController.on('change', (e) => {
        const newValue = e.value;
        if (newValue !== lastValue) {
            setValue(newValue);
        }
    });
    const stateListener = (field: string) => {
        if (field === propertyName) {
            const newValue = subject[propertyName];
            if (newValue !== lastValue) {
                lastValue = newValue;
                guiController.refresh();
            }
        }
    };
    spaceDriver.state.events.on(subject.id, stateListener);
    cleanup(() => {
        guiController.dispose();
        spaceDriver.state.events.removeListener(subject.id, stateListener);
    });
}

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
