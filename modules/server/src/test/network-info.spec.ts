import { getNetworkAddresses, getNetworkInfo } from '../network-info';

describe('getNetworkAddresses', () => {
    it('returns an IPv4/URL pair for each non-internal IPv4 interface', () => {
        const addresses = getNetworkAddresses(
            {
                eth0: [{ address: '10.0.0.5', family: 'IPv4', internal: false } as never],
            },
            8080,
        );
        expect(addresses).toEqual([{ address: '10.0.0.5', url: 'http://10.0.0.5:8080' }]);
    });

    it('drops internal and non-IPv4 interfaces', () => {
        const addresses = getNetworkAddresses(
            {
                lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never],
                eth0: [{ address: '::1', family: 'IPv6', internal: false } as never],
            },
            8080,
        );
        expect(addresses).toEqual([]);
    });

    it('orders 192.168.* before 10.* before 172.16-31.* before everything else', () => {
        const addresses = getNetworkAddresses(
            {
                eth0: [
                    { address: '203.0.113.9', family: 'IPv4', internal: false } as never,
                    { address: '172.20.4.4', family: 'IPv4', internal: false } as never,
                    { address: '10.1.2.3', family: 'IPv4', internal: false } as never,
                    { address: '192.168.1.7', family: 'IPv4', internal: false } as never,
                ],
            },
            8080,
        );
        expect(addresses.map((a) => a.address)).toEqual(['192.168.1.7', '10.1.2.3', '172.20.4.4', '203.0.113.9']);
    });

    it('treats 172.x outside the 16-31 second octet as a non-preferred address', () => {
        const addresses = getNetworkAddresses(
            {
                eth0: [
                    { address: '172.40.0.1', family: 'IPv4', internal: false } as never,
                    { address: '172.16.0.1', family: 'IPv4', internal: false } as never,
                ],
            },
            8080,
        );
        expect(addresses.map((a) => a.address)).toEqual(['172.16.0.1', '172.40.0.1']);
    });

    it('demotes virtual-adapter interfaces even when their address ranks higher', () => {
        const addresses = getNetworkAddresses(
            {
                'VirtualBox Host-Only Network': [{ address: '192.168.56.1', family: 'IPv4', internal: false } as never],
                'Ethernet adapter vEthernet (WSL)': [
                    { address: '172.20.0.1', family: 'IPv4', internal: false } as never,
                ],
                wlan0: [{ address: '10.0.0.5', family: 'IPv4', internal: false } as never],
            },
            8080,
        );
        expect(addresses.map((a) => a.address)).toEqual(['10.0.0.5', '192.168.56.1', '172.20.0.1']);
    });
});

describe('getNetworkInfo', () => {
    it('reports the port and ordered LAN addresses', () => {
        const info = getNetworkInfo(8080, {
            eth0: [{ address: '192.168.1.7', family: 'IPv4', internal: false } as never],
        });
        expect(info).toEqual({ port: 8080, addresses: [{ address: '192.168.1.7', url: 'http://192.168.1.7:8080' }] });
    });

    it('falls back to localhost when no LAN address exists', () => {
        const info = getNetworkInfo(8080, {});
        expect(info).toEqual({ port: 8080, addresses: [{ address: '127.0.0.1', url: 'http://localhost:8080' }] });
    });
});
