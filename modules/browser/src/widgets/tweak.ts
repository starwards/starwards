import * as CamerakitPlugin from '@tweakpane/plugin-camerakit';
import * as SearchListPlugin from 'tweakpane4-search-list-plugin';

import {
    DesignState,
    Destructor,
    Destructors,
    Driver,
    Faction,
    IdleStrategy,
    ScanLevel,
    ShipDriver,
    SmartPilotMode,
    SpaceDriver,
    SpaceObject,
    SpaceState,
    Spaceship,
    TypeFilter,
    createLogger,
    getTweakables,
    spaceCommands,
} from '@starwards/core';
import { FolderApi, Pane } from 'tweakpane';
import {
    OnChange,
    abstractOnChange,
    readProp,
    readWriteNumberProp,
    readWriteProp,
    readWriteVec2Prop,
} from '../property-wrappers';
import {
    addCameraRingBlade,
    addEnumListBlade,
    addInputBlade,
    addListBlade,
    addSearchListBlade,
    addSliderBlade,
    addTextBlade,
    createWidgetPane,
} from '../panel';

import { DashboardWidget } from './dashboard';
import { Schema } from '@colyseus/schema';
import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';
import pluralize from 'pluralize';

const { error: logError } = createLogger('tweak');

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
    cleanup: (d: Destructor) => void,
) => {
    guiFolder.addBinding(subject, 'id', { readonly: true });
    // For ships, velocity is rendered separately below (see `Spaceship.isInstance`) so the
    // GM edit can also disengage the smart pilot's velocity hold — otherwise it thrusts the
    // manually-set velocity away again within a tick or two.
    const genericExclude = Spaceship.isInstance(subject) ? new Set(['velocity']) : undefined;
    addTweakables(spaceDriver, guiFolder, `/${subject.type}/${subject.id}`, cleanup, genericExclude);

    // Scan Levels folder
    const scanLevelsFolder = guiFolder.addFolder({
        title: 'Scan Levels',
        expanded: false,
    });
    cleanup(() => {
        scanLevelsFolder.dispose();
    });

    // Add scan level control for each faction
    const factionCount = Faction.FACTION_COUNT;
    for (let factionId: Faction = 0; factionId < factionCount; factionId++) {
        const factionName = Faction[factionId];
        const scanLevelProp = readWriteProp<number>(
            spaceDriver,
            `/${subject.type}/${subject.id}/scanLevels/${factionId}`,
        );

        // Create options for scan level dropdown
        const scanLevelOptions = [
            { value: ScanLevel.UFO, text: 'UFO' },
            { value: ScanLevel.BASIC, text: 'BASIC' },
            { value: ScanLevel.SNAPSHOT, text: 'SNAPSHOT' },
            { value: ScanLevel.FULL, text: 'FULL' },
        ];

        // Add list blade for this faction's scan level
        addListBlade(
            scanLevelsFolder,
            scanLevelProp,
            {
                label: factionName,
                options: scanLevelOptions,
            },
            cleanup,
        );
    }

    if (Spaceship.isInstance(subject)) {
        const shipDriver = await driver.getShipDriver(subject.id);
        const velocityProp = readWriteVec2Prop(spaceDriver, `/${subject.type}/${subject.id}/velocity`);
        addInputBlade(
            guiFolder,
            {
                ...velocityProp,
                setValue: (v: { x: number; y: number }) => {
                    velocityProp.setValue(v);
                    // A GM-forced velocity is otherwise thrust away again within a tick or
                    // two by the smart pilot's velocity hold / anti-drift / breaks, since
                    // those actively steer the ship back towards their own target speed.
                    shipDriver.sendJsonCmd('/smartPilot/maneuveringMode', SmartPilotMode.DIRECT);
                    shipDriver.sendJsonCmd('/smartPilot/maneuvering/x', 0);
                    shipDriver.sendJsonCmd('/smartPilot/maneuvering/y', 0);
                    shipDriver.sendJsonCmd('/antiDrift', 0);
                    shipDriver.sendJsonCmd('/breaks', 0);
                },
            },
            { label: 'velocity' },
            cleanup,
        );

        const adminDriver = await driver.getAdminDriver();
        const isPlayerShip = adminDriver.state.playerShipIds.includes(subject.id);

        const isPlayerShipProp = {
            getValue: () => isPlayerShip,
            onChange: ((_cb: () => unknown) => () => undefined) as OnChange,
        };
        addTextBlade(guiFolder, isPlayerShipProp, { label: 'is Player ship', disabled: true }, cleanup);

        const buttonLabel = isPlayerShip ? 'Convert to NPC' : 'Convert to Player Ship';
        guiFolder.addButton({ title: buttonLabel }).on('click', () => {
            spaceDriver.command(spaceCommands.convertShipType, {
                shipId: subject.id,
                isPlayerShip: !isPlayerShip,
            });
        });

        const targetIdProp = readWriteProp<string | null>(shipDriver, `/weaponsTarget/targetId`);
        // Searchable target picker instead of free-text id entry: enumerate the other ships as
        // { id: id } options plus a "(none)" entry to clear the target. The plugin binds a plain
        // string, so map the state's `string | null` through '' <-> null. Options are a snapshot
        // of the current ships; the whole tweak panel is rebuilt when the ship roster changes
        // (see the '/playerShipIds' listener in init), so they stay current.
        const targetOptions: Record<string, string> = { '(none)': '' };
        for (const ship of spaceDriver.state.getAll('Spaceship')) {
            if (ship.id !== subject.id) {
                targetOptions[ship.id] = ship.id;
            }
        }
        const targetIdSearchModel = {
            getValue: () => targetIdProp.getValue() ?? '',
            setValue: (v: string) => targetIdProp.setValue(v || null),
            onChange: targetIdProp.onChange,
        };
        addSearchListBlade(guiFolder, targetIdSearchModel, { label: 'targetId', options: targetOptions }, cleanup);

        const currentTaskProp = readProp(shipDriver, `/currentTask`);
        addTextBlade(guiFolder, currentTaskProp, { label: 'Current Task', disabled: true }, cleanup);

        const idleStrategyProp = readWriteProp(shipDriver, `/idleStrategy`);
        addListBlade(
            guiFolder,
            idleStrategyProp,
            {
                label: 'Idle strategy',
                options: Object.values(IdleStrategy)
                    .filter<number>((k): k is number => typeof k === 'number')
                    .map((value) => ({ value, text: String(IdleStrategy[value]) })),
            },
            cleanup,
        );

        const ecrControl = readWriteProp(shipDriver, `/ecrControl`);
        addInputBlade(guiFolder, ecrControl, { label: 'ECR control' }, cleanup);

        const armorFolder = guiFolder.addFolder({
            title: `Armor`,
            expanded: false,
        });
        cleanup(() => {
            armorFolder.dispose();
        });
        addTextBlade(
            armorFolder,
            readProp(shipDriver, `/armor/numberOfPlates`),
            {
                label: 'Plates',
                disabled: true,
            },
            cleanup,
        );
        addTextBlade(
            armorFolder,
            readProp(shipDriver, `/armor/numberOfHealthyPlates`),
            {
                label: 'Healthy Plates',
                disabled: true,
            },
            cleanup,
        );
        addDesignFolder(shipDriver, armorFolder, `/armor`, cleanup);
        for (const system of shipDriver.systems) {
            const modelName = system.state.design?.modelName;
            const systemFolder = guiFolder.addFolder({
                title: modelName ? `${system.state.name} — ${modelName}` : system.state.name,
                expanded: false,
            });
            cleanup(() => systemFolder.dispose());
            const defectibleProps: { onChange: OnChange }[] = [readProp(shipDriver, `${system.pointer}/broken`)];
            for (const defectible of system.defectibles) {
                const prop = readWriteNumberProp(shipDriver, `${system.pointer}/${defectible.field}`);
                defectibleProps.push(prop);
                addSliderBlade(systemFolder, prop, { label: defectible.field }, cleanup);
            }
            systemFolder.element.classList.add('tp-rotv'); // This allows overriding tweakpane theme for this folder
            const applyThemeByStatus = () => (systemFolder.element.dataset.status = system.getStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
            cleanup(abstractOnChange(defectibleProps, system.getStatus, applyThemeByStatus));
            applyThemeByStatus();
            addTweakables(shipDriver, systemFolder, system.pointer, cleanup);
            addDesignFolder(shipDriver, systemFolder, system.pointer, cleanup);
        }
        addDesignFolder(shipDriver, guiFolder, ``, cleanup);
    }
};

function addTweakables(
    driver: SpaceDriver | ShipDriver,
    guiFolder: FolderApi,
    pointer: string,
    cleanup: (d: Destructor) => void,
    exclude?: ReadonlySet<string>,
) {
    const state = readProp<Schema>(driver, pointer).getValue();
    if (!state) return;
    for (const tweakable of getTweakables(state)) {
        if (exclude?.has(tweakable.field)) {
            continue;
        }
        if (tweakable.config === 'number') {
            const prop = readWriteNumberProp(driver, `${pointer}/${tweakable.field}`);
            addSliderBlade(guiFolder, prop, { label: tweakable.field }, cleanup);
        } else if (tweakable.config === 'boolean') {
            const prop = readWriteProp(driver, `${pointer}/${tweakable.field}`);
            addInputBlade(guiFolder, prop, { label: tweakable.field }, cleanup);
        } else if (tweakable.config === 'string') {
            const prop = readWriteProp(driver, `${pointer}/${tweakable.field}`);
            addTextBlade(guiFolder, prop, { label: tweakable.field }, cleanup);
        } else if (tweakable.config === 'vec2') {
            const prop = readWriteVec2Prop(driver, `${pointer}/${tweakable.field}`);
            addInputBlade(guiFolder, prop, { label: tweakable.field }, cleanup);
        } else if (tweakable.config === 'shipId') {
            const rootState = driver.state;
            if (rootState instanceof SpaceState) {
                const prop = readWriteProp(driver, `${pointer}/${tweakable.field}`);
                const list = addListBlade(guiFolder, prop, { label: tweakable.field }, cleanup);
                const shipsProp = readProp<SpaceState['Spaceship']>(driver, `/Spaceship`);
                const updateOptions = () => {
                    list.options = ['', ...(shipsProp.getValue()?.keys() || [])].map((value) => ({
                        value,
                        text: value,
                    }));
                };
                cleanup(shipsProp.onChange(updateOptions));
                updateOptions();
            } else {
                logError('shipId tweak property found outside of space state');
            }
        } else if (tweakable.config.type === 'number') {
            const prop = readWriteProp<number>(driver, `${pointer}/${tweakable.field}`);
            const config = tweakable.config.number || {};
            addCameraRingBlade(guiFolder, prop, { label: tweakable.field, ...config }, cleanup);
        } else if (tweakable.config.type === 'enum') {
            const prop = readWriteProp<number>(driver, `${pointer}/${tweakable.field}`);
            addEnumListBlade(guiFolder, prop, tweakable.field, tweakable.config.enum, cleanup);
        } else if (tweakable.config.type === 'string enum') {
            const prop = readWriteProp(driver, `${pointer}/${tweakable.field}`);
            const options = tweakable.config.enum.map((value) => ({ value, text: value }));
            addListBlade(guiFolder, prop, { label: tweakable.field, options }, cleanup);
        } else {
            throw new Error(`unknown tweakable type :"${JSON.stringify(tweakable.config)}"`);
        }
    }
}

function addDesignFolder(
    shipDriver: ShipDriver,
    guiFolder: FolderApi,
    pointer: string,
    cleanup: (d: Destructor) => void,
) {
    const designFolder = guiFolder.addFolder({
        title: 'design',
        expanded: false,
    });
    cleanup(() => designFolder.dispose());
    const state = readProp<DesignState>(shipDriver, `${pointer}/design`).getValue();
    if (!state) return;
    // Show the string modelName (if set) as a read-only text field at the top
    // of the design folder.
    if (state.modelName) {
        const modelNameProp = readProp<string>(shipDriver, `${pointer}/design/modelName`);
        addTextBlade(designFolder, modelNameProp, { label: 'modelName', disabled: true }, cleanup);
    }
    for (const designParam of state.keys()) {
        // modelName is a string, shown above instead of as a numeric slider.
        if (designParam === 'modelName') continue;
        const prop = readWriteProp<number>(shipDriver, `${pointer}/design/${designParam}`);
        addCameraRingBlade(designFolder, prop, { label: designParam }, cleanup);
    }
}

export function tweakWidget(driver: Driver, selectionContainer: SelectionContainer): DashboardWidget {
    class TweakRoot {
        private pane: Pane;
        private selectionCleanup = new Destructors();
        private spaceDriver: SpaceDriver | null = null;
        private panelCleanup: Destructors;

        constructor(container: WidgetContainer, _: unknown) {
            const { pane, cleanup } = createWidgetPane(container, 'Tweaks');
            this.pane = pane;
            this.panelCleanup = cleanup;
            this.pane.registerPlugin(CamerakitPlugin);
            this.pane.registerPlugin(SearchListPlugin);
            const optionsFolder = this.pane.addFolder({
                title: 'Select Options',
                expanded: true,
            });
            addEnumListBlade(optionsFolder, selectionContainer.filter, 'type', TypeFilter, this.panelCleanup.add);

            void this.init();
        }

        // the async part of initializing
        private async init() {
            const [spaceDriver, adminDriver] = await Promise.all([driver.getSpaceDriver(), driver.getAdminDriver()]);
            this.spaceDriver = spaceDriver;
            this.panelCleanup.add(() => {
                selectionContainer.events.removeListener('changed', this.handleSelectionChange);
            });
            selectionContainer.events.addListener('changed', this.handleSelectionChange);

            const speedProp = readWriteNumberProp(adminDriver, `/speed`);
            addSliderBlade(this.pane, speedProp, { label: 'Game Speed' }, this.panelCleanup.add);

            const onPlayerShipChange = () => {
                this.handleSelectionChange();
            };
            adminDriver.events.on('/playerShipIds', onPlayerShipChange);
            this.panelCleanup.add(() => {
                adminDriver.events.off('/playerShipIds', onPlayerShipChange);
            });

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
                const selectedItems = [...selectionContainer.selectedItems];
                const isSingleSelect = selectedItems.length === 1;
                const spaceDriver = this.spaceDriver;
                if (selectedItems.length) {
                    guiFolder.addButton({ title: isSingleSelect ? 'Delete' : 'Delete all' }).on('click', () =>
                        spaceDriver.command(spaceCommands.bulkDeleteOrder, {
                            ids: selectionContainer.selectedItemsIds,
                        }),
                    );
                }
                for (const subject of selectedItems) {
                    const itemFolder = guiFolder.addFolder({
                        title: `${subject.type} ${subject.id}`,
                        expanded: isSingleSelect,
                    });
                    this.selectionCleanup.add(() => {
                        itemFolder.dispose();
                    });
                    void singleSelectionDetails(
                        subject,
                        driver,
                        this.spaceDriver,
                        itemFolder,
                        this.selectionCleanup.add,
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
