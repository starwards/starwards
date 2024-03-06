import { AdminDriver, DefectibleValue, Destructors, Driver, GameStatus, ShipDriver, TaskLoop } from '@starwards/core';
import { DependencyList, useEffect, useRef, useState } from 'react';
import { abstractOnChange, readProp } from '../property-wrappers';

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
            }),
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
    useLoop(async () => setgamesCount((await driver.getGameStatus()) === GameStatus.RUNNING), 500, [driver]);
    return gamesCount;
}

export function useCanStartGame(driver: Driver): boolean | null {
    const [gamesCount, setgamesCount] = useState<boolean | null>(null);
    useLoop(async () => setgamesCount((await driver.getGameStatus()) === GameStatus.STOPPED), 500, [driver]);
    return gamesCount;
}

export function usePlayerShips(driver: Driver): string[] {
    const [ships, setShips] = useState<string[]>([]);
    useLoop(async () => setShips([...(await driver.getCurrentPlayerShipIds())]), 500, [driver]);
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

export function defectReadProp(driver: ShipDriver) {
    return (d: DefectibleValue) => {
        const pointer = `${d.systemPointer}/${d.field}`;
        const name = readProp<string>(driver, `${d.systemPointer}/name`).getValue();
        const numberProp = readProp<number>(driver, pointer);
        let alertTime = 0;
        const getIsOk = () => numberProp.getValue() === d.normal;
        let isOk = getIsOk();
        return {
            pointer: numberProp.pointer,
            onChange(cb: () => unknown) {
                return abstractOnChange([numberProp], getIsOk, () => {
                    isOk = getIsOk();
                    if (!getIsOk()) {
                        alertTime = Date.now();
                    }
                    cb();
                });
            },
            getValue: () => {
                return { name, status: d.name, pointer, alertTime, isOk };
            },
        };
    };
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
