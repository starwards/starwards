import {
    AdminDriver,
    DefectibleValue,
    Destructors,
    Driver,
    ShipDriver,
    TaskLoop,
    getDefectibles,
} from '@starwards/core';
import { DependencyList, useEffect, useMemo, useRef, useState } from 'react';

import { readProp } from '../property-wrappers';

export function useConstant<T>(init: () => T): T {
    const ref = useRef<{ v: T } | null>(null);
    if (!ref.current) {
        ref.current = { v: init() };
    }
    return ref.current.v;
}

export function useSorted<T>(elements: T[]): [T[], (t: T) => void] {
    const [sorted, setThrusters] = useState(elements);
    const pushToEnd = useConstant(
        () => (t: T) =>
            setThrusters((s) => {
                const idx = s.indexOf(t);
                return [...s.slice(0, idx), ...s.slice(idx + 1), s[idx]];
            })
    );
    return [sorted, pushToEnd];
}

export function useAdminDriver(driver: Driver): AdminDriver | null {
    const [adminDriver, setAdminDriver] = useState<AdminDriver | null>(null);
    useEffect(() => void driver.getAdminDriver().then(setAdminDriver), [driver]);
    return adminDriver;
}

export function useIsGameRunning(driver: Driver): boolean | null {
    const [gamesCount, setgamesCount] = useState<boolean | null>(null);
    useLoop(async () => setgamesCount(await driver.isActiveGame()), 500, [driver]);
    return gamesCount;
}

export function useShips(driver: Driver): string[] {
    const [ships, setShips] = useState<string[]>([]);
    useLoop(async () => setShips([...(await driver.getCurrentShipIds())]), 500, [driver]);
    return ships;
}

export function useLoop(callback: () => unknown, intervalMs: number, deps: DependencyList) {
    useEffect(() => {
        const loop = new TaskLoop(callback, intervalMs);
        loop.start();
        return loop.stop;
        // eslint-disable-next-line react-hooks/exhaustive-deps, @typescript-eslint/no-unsafe-assignment
    }, [intervalMs, ...deps]);
}

function defectReadProp(driver: ShipDriver) {
    return (d: DefectibleValue) => {
        const pointer = `${d.systemPointer}/${d.field}`;
        const nameProp = readProp<string>(driver, `${d.systemPointer}/name`);
        const numberProp = readProp<number>(driver, pointer);
        // abstract the number property as a property that only changes when the state of defect (`isOk`) changes
        let lastOk = numberProp.getValue() === d.normal;
        let alertTime = 0;
        return {
            pointer: numberProp.pointer,
            onChange(cb: () => unknown) {
                return numberProp.onChange(() => {
                    const isOk = numberProp.getValue() === d.normal;
                    if (isOk !== lastOk) {
                        if (lastOk) {
                            alertTime = Date.now();
                        }
                        lastOk = isOk;
                        cb();
                    }
                });
            },
            getValue: () => {
                const isOk = numberProp.getValue() === d.normal;
                return { name: nameProp.getValue(), status: d.name, pointer, alertTime, isOk };
            },
        };
    };
}

export function useDefectibles(driver: ShipDriver) {
    const defectiblesProperties = useMemo(() => getDefectibles(driver.state).map(defectReadProp(driver)), [driver]);
    return useProperties(defectiblesProperties);
}

export type ReadProperty<T> = {
    pointer: { pointer: string };
    getValue: () => T;
    onChange: (cb: () => void) => () => void;
};
export function useProperty<T>(property: ReadProperty<T>): T {
    const [value, setValue] = useState(property.getValue());
    useEffect(() => property.onChange(() => setValue(property.getValue())), [property]);
    return value;
}

export function useProperties<T>(properties: ReadProperty<T>[]): T[] {
    const [value, setValue] = useState(properties.map((p) => p.getValue()));
    useEffect(() => {
        const d = new Destructors();
        for (const property of properties) {
            d.add(property.onChange(() => setValue(properties.map((p) => p.getValue()))));
        }
        return d.destroy;
    }, [properties]);
    return value;
}
