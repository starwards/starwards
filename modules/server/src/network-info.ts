import * as os from 'os';

export interface NetworkAddress {
    address: string;
    url: string;
}

export interface NetworkInfo {
    port: number;
    addresses: NetworkAddress[];
}

const PRIVATE_172_RANGE = /^172\.(1[6-9]|2\d|3[01])\./;

/** Lower sorts first: the ranges a home/office router is most likely to hand out. */
function lanPriority(address: string): number {
    if (address.startsWith('192.168.')) return 0;
    if (address.startsWith('10.')) return 1;
    if (PRIVATE_172_RANGE.test(address)) return 2;
    return 3;
}

export function getNetworkAddresses(
    interfaces: ReturnType<typeof os.networkInterfaces>,
    port: number,
): NetworkAddress[] {
    const addresses: NetworkAddress[] = [];
    for (const infos of Object.values(interfaces)) {
        for (const info of infos ?? []) {
            if (info.family === 'IPv4' && !info.internal) {
                addresses.push({ address: info.address, url: `http://${info.address}:${port}` });
            }
        }
    }
    return addresses.sort((a, b) => lanPriority(a.address) - lanPriority(b.address));
}

export function getNetworkInfo(
    port: number,
    interfaces: ReturnType<typeof os.networkInterfaces> = os.networkInterfaces(),
): NetworkInfo {
    const addresses = getNetworkAddresses(interfaces, port);
    return {
        port,
        addresses: addresses.length ? addresses : [{ address: '127.0.0.1', url: `http://localhost:${port}` }],
    };
}
