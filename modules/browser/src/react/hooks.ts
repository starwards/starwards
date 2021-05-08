import { AdminDriver, Driver, ShipDriver } from '../driver';
import React, { useEffect, useState } from 'react';
import { SpaceObject, Spaceship } from '@starwards/model';

import { SelectionContainer } from '../radar/selection-container';
import { TaskLoop } from '../task-loop';

export function useSelected(selectionContainer: SelectionContainer): Array<SpaceObject> {
    const [selected, setSelected] = useState([...selectionContainer.selectedItems]);

    useEffect(() => {
        const handleSelectionChange = () => setSelected([...selectionContainer.selectedItems]);
        selectionContainer.events.addListener('changed', handleSelectionChange);
        return () => void selectionContainer.events.removeListener('changed', handleSelectionChange);
    }, [selectionContainer]);
    return selected;
}

export function useAdminDriver(driver: Driver): AdminDriver | null {
    const [adminDriver, setAdminDriver] = useState<AdminDriver | null>(null);
    useEffect(() => void driver.getAdminDriver().then(setAdminDriver), [driver]);
    return adminDriver;
}

export function useShipDriver(subject: SpaceObject | undefined, driver: Driver): ShipDriver | undefined {
    const [shipDriver, setShipDriver] = useState<ShipDriver | undefined>(undefined);
    useEffect(() => {
        if (Spaceship.isInstance(subject)) {
            void driver.getShipDriver(subject.id).then(setShipDriver);
        }
    }, [driver, subject]);
    return shipDriver;
}

export function useIsGameRunning(driver: Driver): boolean {
    const [gamesCount, setgamesCount] = useState(false);
    useLoop(async () => setgamesCount(await driver.isActiveGame()), 500);
    return gamesCount;
}

export function useShips(driver: Driver): string[] {
    const [ships, setShips] = useState<string[]>([]);
    useLoop(async () => setShips([...(await driver.getCurrentShipIds())]), 500);
    return ships;
}

export function useLoop(callback: () => unknown, intervalMs: number) {
    useEffect(() => {
        const loop = new TaskLoop(callback, intervalMs);
        loop.start();
        return loop.stop;
    });
}

export type ReadProperty<T> = { getValue: () => T };
export function useProperty<T>(property: ReadProperty<T>, intervalMs: number) {
    const [value, setValue] = React.useState(property.getValue());
    useLoop(() => setValue(property.getValue()), intervalMs);
    return value;
}
