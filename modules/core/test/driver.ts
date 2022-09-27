import { Driver } from '../src';

export function makeClient(url: () => string) {
    let driver: Driver | null = null;
    beforeEach(() => {
        driver = new Driver(new URL(url())).connect();
    });
    afterEach(() => {
        driver?.destroy();
    });
    return {
        get driver() {
            if (!driver) throw new Error('missing driver');
            return driver;
        },
    };
}
