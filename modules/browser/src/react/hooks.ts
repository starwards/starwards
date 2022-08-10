import { AdminDriver, Driver, TaskLoop } from '@starwards/core';
import { DependencyList, useEffect, useRef, useState } from 'react';

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

const REFRESH_MILLI = 100;
export type ReadProperty<T> = { getValue: () => T };
export function useProperty<T>(property: ReadProperty<T>, intervalMs: number = REFRESH_MILLI) {
    const [value, setValue] = useState(property.getValue());
    useLoop(() => setValue(property.getValue()), intervalMs, [property]);
    return value;
}
