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
    lockCommands,
    spaceCommands,
} from '@starwards/core';
import { FolderApi, Pane } from 'tweakpane';
import {
    Model,
    addCameraRingBlade,
    addEnumListBlade,
    addInputBlade,
    addListCellToRow,
    addLockBlade,
    addLockCellToRow,
    addSearchListBlade,
    addSliderBlade,
    addSliderCellToRow,
    addTextBlade,
    addTextCellToRow,
    createWidgetPane,
} from '../panel';
import {
    OnChange,
    abstractOnChange,
    readProp,
    readWriteNumberProp,
    readWriteProp,
    readWriteVec2Prop,
} from '../property-wrappers';
import { RowApi, plugins as TweakpaneTablePlugin } from 'tweakpane-table';

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

/**
 * Both ship- and space-rooted state now carry a GM property lock (`ShipState`/`SpaceState`
 * both implement `Lockable` — see `lock-commands.ts`), so any driver in the tweak panel can
 * lock the fields it renders.
 */
type LockableDriver = ShipDriver | SpaceDriver;

/**
 * Views `driver` with its `sendJsonCmd` replaced by `sendGmJsonCmd` — the GM tweak panel's write
 * channel, which bypasses the property lock (see `lock-registry.ts`'s `withLockBypass` and
 * `commands.ts`'s `handleGmSetValueCommand`). Every value write in this widget goes through a
 * GM-view driver so a locked property still responds to the GM's own edits (invariant I10: the
 * GM outranks the lock); every other writer (crew stations, bots, MCP, node-red) keeps using the
 * plain `sendJsonCmd` and stays blocked.
 *
 * `Object.create` (not object spread) so the `state`/`events` accessors stay live bindings to the
 * underlying room rather than a one-time snapshot; only `sendJsonCmd` is overridden as an own
 * property. `command()` (the lock-toggle channel) is untouched — locking/unlocking was never
 * subject to the lock it manipulates.
 */
function asGmDriver<D extends { sendJsonCmd: unknown; sendGmJsonCmd: D['sendJsonCmd'] }>(driver: D): D {
    return Object.create(driver, {
        sendJsonCmd: { value: driver.sendGmJsonCmd, enumerable: true },
    }) as D;
}

/**
 * A field's GM-lock state as a `Model<boolean>`, ready for `addLockCellToRow`/`addLockBlade`.
 * Takes multiple JSON Pointer paths (rather than one) because a single tweakable *row* can back
 * onto more than one lockable field — a `vec2` is stored as two independently `@commandable`
 * leaves (`/x`, `/y`); "locked" for the row means both are locked, and toggling the row toggles
 * both together. `driver` is cast to `ShipDriver`: `ShipDriver`/`SpaceDriver` both expose an
 * identically-shaped `command<T>(cmd, value)` (see `client/ship.ts`/`client/space.ts`), but their
 * generic parameter is fixed to their own root state type, so TypeScript can't confirm a
 * union-typed `driver` satisfies both call signatures at once — `lockCommands.lockProperty` is
 * generic over any `Schema & Lockable` root, so the call is sound at runtime either way.
 */
function lockedRowProp(driver: LockableDriver, fieldPointers: readonly string[]): Model<boolean> {
    return {
        getValue: () => fieldPointers.every((path) => driver.state.lockedPaths.includes(path)),
        setValue: (locked: boolean) => {
            for (const path of fieldPointers) {
                (driver as ShipDriver).command(lockCommands.lockProperty, { path, locked });
            }
        },
        onChange: (cb: () => unknown) => {
            const listener = () => cb();
            driver.events.on('/lockedPaths', listener);
            return () => driver.events.off('/lockedPaths', listener);
        },
    };
}

/**
 * One row — label, value cell(s), lock cell — for a tweakable field, via `tweakpane-table`
 * (`guiFolder.registerPlugin(TweakpaneTablePlugin)` must already have been called on this
 * folder's pane). `addValueCells` renders the field's own control(s); the lock cell is appended
 * automatically whenever `driver` is lockable and `fieldPointers` is non-empty, so a new call
 * site can't add a row without a lock by omission — see the design ruling on issue #2139/PR
 * #2171 (a lock freezes the simulation's own writes, not only remote writers, so it must be
 * available everywhere the GM can write a value, not only on the subset that happened to be
 * wired through `addTweakables`).
 */
function addTweakableRow(
    guiFolder: FolderApi,
    label: string,
    addValueCells: (row: RowApi) => void,
    driver: LockableDriver | null,
    fieldPointers: readonly string[],
    cleanup: (d: Destructor) => void,
): RowApi {
    const row = guiFolder.addBlade({ view: 'tableRow', label }) as RowApi;
    cleanup(() => row.dispose());
    addValueCells(row);
    if (driver && fieldPointers.length) {
        addLockCellToRow(row, lockedRowProp(driver, fieldPointers), cleanup);
    }
    return row;
}

const singleSelectionDetails = async (
    subject: SpaceObject,
    driver: Driver,
    rawSpaceDriver: SpaceDriver,
    guiFolder: FolderApi,
    cleanup: (d: Destructor) => void,
) => {
    // This whole widget is the GM tweak panel — every value write it issues must bypass the
    // property lock (invariant I10). `lockedRowProp`/`lockCommands` (the lock toggle itself) are
    // unaffected either way, so the raw driver is still fine there.
    const spaceDriver = asGmDriver(rawSpaceDriver);
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
        const fieldPointer = `/${subject.type}/${subject.id}/scanLevels/${factionId}`;
        const scanLevelProp = readWriteProp<number>(spaceDriver, fieldPointer);

        // Create options for scan level dropdown
        const scanLevelOptions = [
            { value: ScanLevel.UFO, text: 'UFO' },
            { value: ScanLevel.BASIC, text: 'BASIC' },
            { value: ScanLevel.SNAPSHOT, text: 'SNAPSHOT' },
            { value: ScanLevel.FULL, text: 'FULL' },
        ];

        addTweakableRow(
            scanLevelsFolder,
            factionName,
            (row) => addListCellToRow(row, scanLevelProp, { options: scanLevelOptions }, cleanup),
            spaceDriver,
            [fieldPointer],
            cleanup,
        );
    }

    if (Spaceship.isInstance(subject)) {
        const shipDriver = asGmDriver(await driver.getShipDriver(subject.id));
        const velocityPointer = `/${subject.type}/${subject.id}/velocity`;
        const velocityProp = readWriteVec2Prop(spaceDriver, velocityPointer);
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
        // velocity's point2d drag pad is a Tweakpane *binding* plugin, not a blade view, so it
        // can't be placed as a `tweakpane-table` cell (see `addLockBlade`'s doc) — locked as a
        // sibling blade instead. Locking suppresses the write to velocity.x/y themselves; the
        // disengage side-effect commands above target different fields (smartPilot.*,
        // antiDrift, breaks) and are unaffected by a velocity lock — each has its own,
        // independent lock, exactly like any other field.
        addLockBlade(guiFolder, lockedRowProp(spaceDriver, [`${velocityPointer}/x`, `${velocityPointer}/y`]), cleanup);

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

        addTweakableRow(
            guiFolder,
            'Idle strategy',
            (row) =>
                addListCellToRow(
                    row,
                    readWriteProp(shipDriver, `/idleStrategy`),
                    {
                        options: Object.values(IdleStrategy)
                            .filter<number>((k): k is number => typeof k === 'number')
                            .map((value) => ({ value, text: String(IdleStrategy[value]) })),
                    },
                    cleanup,
                ),
            shipDriver,
            ['/idleStrategy'],
            cleanup,
        );

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
        addTweakables(shipDriver, armorFolder, `/armor`, cleanup);
        for (const system of shipDriver.systems) {
            const modelName = system.state.design?.modelName;
            const systemFolder = guiFolder.addFolder({
                title: modelName ? `${system.state.name} — ${modelName}` : system.state.name,
                expanded: false,
            });
            cleanup(() => systemFolder.dispose());
            const defectibleProps: { onChange: OnChange }[] = [readProp(shipDriver, `${system.pointer}/broken`)];
            for (const defectible of system.defectibles) {
                const fieldPointer = `${system.pointer}/${defectible.field}`;
                const prop = readWriteNumberProp(shipDriver, fieldPointer);
                defectibleProps.push(prop);
                addTweakableRow(
                    systemFolder,
                    defectible.field,
                    (row) => addSliderCellToRow(row, prop, {}, cleanup),
                    shipDriver,
                    [fieldPointer],
                    cleanup,
                );
            }
            // `broken` is a computed `abstract readonly boolean` getter (system.ts) derived from
            // the defectible factors above, not a @gameField — there is no write to lock.
            // Turret.bearingCommand is a getter over the synced bearingCommandRaw, so it's not an
            // own enumerable property of the instance — getTweakables()'s Object.keys(state) sweep
            // (below, via addTweakables) never finds it. Wire it explicitly instead.
            if ('bearingCommandRaw' in system.state) {
                const fieldPointer = `${system.pointer}/bearingCommand`;
                const prop = readWriteNumberProp(shipDriver, fieldPointer);
                addTweakableRow(
                    systemFolder,
                    'bearingCommand',
                    (row) => addSliderCellToRow(row, prop, {}, cleanup),
                    shipDriver,
                    [fieldPointer],
                    cleanup,
                );
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

const booleanOptions = [
    { value: false, text: 'false' },
    { value: true, text: 'true' },
];

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
        const fieldPointer = `${pointer}/${tweakable.field}`;
        if (tweakable.config === 'number') {
            const prop = readWriteNumberProp(driver, fieldPointer);
            addTweakableRow(
                guiFolder,
                tweakable.field,
                (row) => addSliderCellToRow(row, prop, {}, cleanup),
                driver,
                [fieldPointer],
                cleanup,
            );
        } else if (tweakable.config === 'boolean') {
            const prop = readWriteProp<boolean>(driver, fieldPointer);
            addTweakableRow(
                guiFolder,
                tweakable.field,
                (row) => addListCellToRow(row, prop, { options: booleanOptions }, cleanup),
                driver,
                [fieldPointer],
                cleanup,
            );
        } else if (tweakable.config === 'string') {
            const prop = readWriteProp(driver, fieldPointer);
            addTweakableRow(
                guiFolder,
                tweakable.field,
                (row) => addTextCellToRow(row, prop, {}, cleanup),
                driver,
                [fieldPointer],
                cleanup,
            );
        } else if (tweakable.config === 'vec2') {
            // The point2d drag pad is a Tweakpane *binding* plugin (no blade-view equivalent —
            // see `addLockBlade`'s doc), and vec2 tweakables (velocity, ...) commonly carry no
            // @range metadata to fall back to slider cells, so — like the bespoke ship-velocity
            // control above — this stays a folder blade with a sibling lock rather than a row.
            // A plain text cell was tried and rejected: Tweakpane's raw (non-`addBinding`) 'text'
            // blade has no numeric round-trip — typed input arrives at `setValue` as a string,
            // which the schema setter then rejects.
            const prop = readWriteVec2Prop(driver, fieldPointer);
            addInputBlade(guiFolder, prop, { label: tweakable.field }, cleanup);
            addLockBlade(guiFolder, lockedRowProp(driver, [`${fieldPointer}/x`, `${fieldPointer}/y`]), cleanup);
        } else if (tweakable.config === 'shipId') {
            const rootState = driver.state;
            if (rootState instanceof SpaceState) {
                const prop = readWriteProp<string>(driver, fieldPointer);
                const shipsProp = readProp<SpaceState['Spaceship']>(driver, `/Spaceship`);
                let listCell: ReturnType<typeof addListCellToRow<string>> | null = null;
                const updateOptions = () => {
                    const options = ['', ...(shipsProp.getValue()?.keys() || [])].map((value) => ({
                        value,
                        text: value,
                    }));
                    if (listCell) {
                        listCell.options = options;
                    }
                };
                addTweakableRow(
                    guiFolder,
                    tweakable.field,
                    (row) => {
                        listCell = addListCellToRow(row, prop, {}, cleanup);
                        updateOptions();
                    },
                    driver,
                    [fieldPointer],
                    cleanup,
                );
                cleanup(shipsProp.onChange(updateOptions));
            } else {
                logError('shipId tweak property found outside of space state');
            }
        } else if (tweakable.config.type === 'number') {
            // camera-ring is a Tweakpane *binding* plugin (no blade-view equivalent, see
            // `addLockBlade`'s doc) and these fields (radius, turnSpeed, ...) have no @range
            // metadata to safely fall back to a plain slider cell — kept as a folder blade with
            // a sibling lock, like the design-folder fields below and the velocity drag pad.
            const prop = readWriteProp<number>(driver, fieldPointer);
            const config = tweakable.config.number || {};
            addCameraRingBlade(guiFolder, prop, { label: tweakable.field, ...config }, cleanup);
            addLockBlade(guiFolder, lockedRowProp(driver, [fieldPointer]), cleanup);
        } else if (tweakable.config.type === 'enum') {
            const prop = readWriteProp<number>(driver, fieldPointer);
            const enumObj = tweakable.config.enum;
            const options = Object.values(enumObj)
                .filter<number>((k): k is number => typeof k === 'number')
                .filter((k) => !String(enumObj[k]).endsWith('_COUNT'))
                .map((value) => ({ value, text: String(enumObj[value]) }));
            addTweakableRow(
                guiFolder,
                tweakable.field,
                (row) => addListCellToRow(row, prop, { options }, cleanup),
                driver,
                [fieldPointer],
                cleanup,
            );
        } else if (tweakable.config.type === 'string enum') {
            const prop = readWriteProp(driver, fieldPointer);
            const options = tweakable.config.enum.map((value) => ({ value, text: value }));
            addTweakableRow(
                guiFolder,
                tweakable.field,
                (row) => addListCellToRow(row, prop, { options }, cleanup),
                driver,
                [fieldPointer],
                cleanup,
            );
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
        const fieldPointer = `${pointer}/design/${designParam}`;
        const prop = readWriteProp<number>(shipDriver, fieldPointer);
        // camera-ring is a binding plugin, not a blade view — see the `.config.type === 'number'`
        // branch in addTweakables for the same constraint (no tweakpane-table cell equivalent,
        // and DesignState constants carry no @range metadata to fall back to a slider cell).
        addCameraRingBlade(designFolder, prop, { label: designParam }, cleanup);
        addLockBlade(designFolder, lockedRowProp(shipDriver, [fieldPointer]), cleanup);
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
            this.pane.registerPlugin(TweakpaneTablePlugin);
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

            // AdminState carries no lock (only ShipState/SpaceState implement Lockable, and the
            // admin room has no GM_SET_VALUE handler), so the plain channel is correct here.
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
