import * as CamerakitPlugin from '@tweakpane/plugin-camerakit';

import {
    DesignState,
    Destructor,
    Destructors,
    Driver,
    ShipDriver,
    SpaceDriver,
    SpaceObject,
    Spaceship,
    getTweakables,
} from '@starwards/core';
import { FolderApi, Pane } from 'tweakpane';
import { OnChange, abstractOnChange, readProp, readWriteNumberProp, readWriteProp } from '../property-wrappers';
import { addCameraRingBlade, addEnumListBlade, addInputBlade, addSliderBlade, addTextBlade } from '../panel';

import { DashboardWidget } from './dashboard';
import { Schema } from '@colyseus/schema';
import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';
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
    cleanup: (d: Destructor) => void,
) => {
    guiFolder.addInput(subject, 'id', { disabled: true });
    addTweakables(spaceDriver, guiFolder, `/${subject.type}/${subject.id}`, cleanup);
    if (Spaceship.isInstance(subject)) {
        const shipDriver = await driver.getShipDriver(subject.id);

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
            const systemFolder = guiFolder.addFolder({
                title: system.state.name,
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
) {
    const state = readProp<Schema>(driver, pointer).getValue();
    for (const tweakable of getTweakables(state)) {
        if (tweakable.config === 'number') {
            const prop = readWriteNumberProp(driver, `${pointer}/${tweakable.field}`);
            addSliderBlade(guiFolder, prop, { label: tweakable.field }, cleanup);
        } else if (tweakable.config === 'boolean') {
            const prop = readWriteProp(driver, `${pointer}/${tweakable.field}`);
            addInputBlade(guiFolder, prop, { label: tweakable.field }, cleanup);
        } else if (tweakable.config === 'string') {
            const prop = readWriteProp(driver, `${pointer}/${tweakable.field}`);
            addTextBlade(guiFolder, prop, { label: tweakable.field }, cleanup);
        } else if (tweakable.config.type === 'number') {
            const prop = readWriteProp<number>(driver, `${pointer}/${tweakable.field}`);
            const config = tweakable.config.number || {};
            addCameraRingBlade(guiFolder, prop, { label: tweakable.field, ...config }, cleanup);
        } else if (tweakable.config.type === 'enum') {
            const prop = readWriteProp(driver, `${pointer}/${tweakable.field}`);
            const enumObj = tweakable.config.enum;
            const options = Object.values(enumObj)
                .filter<number>((k): k is number => typeof k === 'number')
                .filter((k) => !String(enumObj[k]).endsWith('_COUNT'))
                .map((value) => ({ value, text: String(enumObj[value]) }));
            addEnumListBlade(guiFolder, prop, { label: tweakable.field, options }, cleanup);
        } else if (tweakable.config.type === 'string enum') {
            const prop = readWriteProp(driver, `${pointer}/${tweakable.field}`);
            const options = tweakable.config.enum.map((value) => ({ value, text: value }));
            addEnumListBlade(guiFolder, prop, { label: tweakable.field, options }, cleanup);
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
    for (const designParam of state.keys()) {
        const prop = readWriteProp<number>(shipDriver, `${pointer}/design/${designParam}`);
        addCameraRingBlade(designFolder, prop, { label: designParam }, cleanup);
    }
}

export function tweakWidget(driver: Driver, selectionContainer: SelectionContainer): DashboardWidget {
    class TweakRoot {
        private pane: Pane;
        private selectionCleanup = new Destructors();
        private spaceDriver: SpaceDriver | null = null;
        private panelCleanup = new Destructors();

        constructor(container: WidgetContainer, _: unknown) {
            this.pane = new Pane({ container: container.getElement().get(0) });
            this.pane.registerPlugin(CamerakitPlugin);
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
                        expanded: [...selectionContainer.selectedItems].length === 1,
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
