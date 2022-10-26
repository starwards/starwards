import { Destructor, Destructors, Driver, SpaceDriver, SpaceObject, Spaceship } from '@starwards/core';
import { FolderApi, Pane } from 'tweakpane';
import { OnChange, abstractOnChange, readProp, readWriteNumberProp, readWriteProp } from '../property-wrappers';
import { addEnumListBlade, addInputBlade, addSliderBlade, addTextBlade } from '../panel';

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
    addInputBlade(
        guiFolder,
        readWriteProp(spaceDriver, `/${subject.type}/${subject.id}/freeze`),
        { label: 'Freeze' },
        cleanup
    );

    if (Spaceship.isInstance(subject)) {
        const shipDriver = await driver.getShipDriver(subject.id);
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
            cleanup
        );
        addTextBlade(
            armorFolder,
            readProp(shipDriver, `/armor/numberOfHealthyPlates`),
            {
                label: 'Healthy Plates',
                disabled: true,
            },
            cleanup
        );
        for (const system of shipDriver.systems) {
            const systemFolder = guiFolder.addFolder({
                title: system.state.name,
                expanded: false,
            });
            // This allows overriding tweakpane theme for this folder
            systemFolder.element.classList.add('tp-rotv');
            cleanup(() => {
                systemFolder.dispose();
            });
            const defectibleProps: { onChange: OnChange }[] = [readProp(shipDriver, `${system.pointer}/broken`)];
            for (const defectible of system.defectibles) {
                const prop = readWriteNumberProp(shipDriver, `${system.pointer}/${defectible.field}`);
                defectibleProps.push(prop);
                addSliderBlade(systemFolder, prop, { label: defectible.field }, cleanup);
            }
            // this will change tweakpane theme for this folder, see tweakpane.css
            const applyThemeByStatus = () => (systemFolder.element.dataset.status = system.getStatus());
            cleanup(abstractOnChange(defectibleProps, system.getStatus, applyThemeByStatus));
            applyThemeByStatus();
            for (const tweakable of system.tweakables) {
                if (tweakable.config === 'number') {
                    const prop = readWriteNumberProp(shipDriver, `${system.pointer}/${tweakable.field}`);
                    addSliderBlade(systemFolder, prop, { label: tweakable.field }, cleanup);
                } else {
                    const prop = readWriteProp(shipDriver, `${system.pointer}/${tweakable.field}`);
                    const enumObj = tweakable.config.enum;
                    const options = Object.values(enumObj)
                        .filter<number>((k): k is number => typeof k === 'number')
                        .map((value) => ({ value, text: String(enumObj[value]) }));
                    addEnumListBlade(systemFolder, prop, { label: tweakable.field, options }, cleanup);
                }
            }
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
