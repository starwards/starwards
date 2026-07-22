import { DEFAULT_GROUP_NAME, groupDisplayName, listOwnGroups } from '../radar/waypoint-group-layers';
import { Model, addSearchListBlade } from '../panel';

import { Destructor } from '@starwards/core';
import { FolderApi } from 'tweakpane';
import { SpaceDriver } from '@starwards/core';

// shown (and never written) when the current group is not one of the options
const PLACEHOLDER = '—';

/**
 * Searchable picker of the ship's existing waypoint groups, bound to a group ("collection")
 * model. The blade's value is clamped to its own option set: an unknown group is presented
 * as a placeholder instead of the raw value, because tweakpane's list constraint rewrites
 * values outside the options and fights the model binding into infinite recursion.
 */
export function addGroupPickerBlade(
    guiFolder: FolderApi,
    model: Model<string>,
    label: string,
    spaceDriver: SpaceDriver,
    shipId: string,
    cleanup: (d: Destructor) => void,
) {
    const options = Object.fromEntries([
        [PLACEHOLDER, PLACEHOLDER],
        [DEFAULT_GROUP_NAME, ''],
        ...listOwnGroups(spaceDriver, shipId)
            .filter(Boolean)
            .map((g) => [groupDisplayName(g), g]),
    ]) as Record<string, string>;
    const values = Object.values(options);
    const clamped: Model<string> = {
        getValue: () => {
            const value = model.getValue();
            return value !== undefined && values.includes(value) ? value : PLACEHOLDER;
        },
        setValue: (value: string) => {
            if (value !== PLACEHOLDER) {
                model.setValue?.(value);
            }
        },
        onChange: model.onChange,
    };
    return addSearchListBlade(guiFolder, clamped, { label, options }, cleanup);
}
