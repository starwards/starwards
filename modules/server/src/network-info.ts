import * as os from 'os';

import { NetworkAddress, NetworkInfo } from '@starwards/core/internal';

export type { NetworkAddress, NetworkInfo };

const PRIVATE_172_RANGE = /^172\.(1[6-9]|2\d|3[01])\./;
/** VirtualBox/VMware/Hyper-V/Docker/WSL adapters — real but not what a phone on the LAN can reach. */
const VIRTUAL_ADAPTER_NAME = /vethernet|virtualbox|vmware|vmnet|docker|wsl/i;

/** Lower sorts first: the ranges a home/office router is most likely to hand out. */
function lanPriority(interfaceName: string, address: string): number {
    let priority = 3;
    if (address.startsWith('192.168.')) priority = 0;
    else if (address.startsWith('10.')) priority = 1;
    else if (PRIVATE_172_RANGE.test(address)) priority = 2;
    // demoted below every real range, but ordered the same way among themselves
    return VIRTUAL_ADAPTER_NAME.test(interfaceName) ? priority + 10 : priority;
}

export function getNetworkAddresses(
    interfaces: ReturnType<typeof os.networkInterfaces>,
    port: number,
): NetworkAddress[] {
    const addresses: (NetworkAddress & { interfaceName: string })[] = [];
    for (const [interfaceName, infos] of Object.entries(interfaces)) {
        for (const info of infos ?? []) {
            if (info.family === 'IPv4' && !info.internal) {
                addresses.push({ interfaceName, address: info.address, url: `http://${info.address}:${port}` });
            }
        }
    }
    return addresses
        .sort((a, b) => lanPriority(a.interfaceName, a.address) - lanPriority(b.interfaceName, b.address))
        .map(({ address, url }) => ({ address, url }));
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
