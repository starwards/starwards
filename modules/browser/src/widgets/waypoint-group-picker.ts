import { Destructor, SpaceDriver } from '@starwards/core';
import { Model, addInputBlade } from '../panel';

import { FolderApi } from 'tweakpane';
import { listOwnGroups } from '../radar/waypoint-group-layers';

let nextListId = 0;

/**
 * Group ("collection") combo blade: a text input with a dropdown of the ship's existing
 * waypoint groups (native datalist). Picking suggests, typing an unknown name implicitly
 * creates a new group; an empty value is the default group.
 */
export function addGroupComboBlade(
    guiFolder: FolderApi,
    model: Model<string>,
    label: string,
    spaceDriver: SpaceDriver,
    shipId: string,
    cleanup: (d: Destructor) => void,
) {
    const blade = addInputBlade<string>(guiFolder, model, { label }, cleanup);
    const input = blade.element.querySelector('input');
    if (input) {
        const dataList = document.createElement('datalist');
        dataList.id = `waypoint-groups-${nextListId++}`;
        input.setAttribute('list', dataList.id);
        input.after(dataList);
        const refreshOptions = () => {
            dataList.replaceChildren(
                ...listOwnGroups(spaceDriver, shipId)
                    .filter(Boolean)
                    .map((g) => {
                        const option = document.createElement('option');
                        option.value = g;
                        return option;
                    }),
            );
        };
        refreshOptions();
        input.addEventListener('focus', refreshOptions);
        cleanup(() => input.removeEventListener('focus', refreshOptions));
    }
    return blade;
}
