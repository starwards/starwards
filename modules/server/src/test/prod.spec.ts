import { formatBanner, resolvePort } from '../prod';

describe('resolvePort', () => {
    it('defaults to 80 when not packaged and PORT is unset', () => {
        expect(resolvePort({}, false)).toBe(80);
    });

    it('defaults to 8080 when packaged and PORT is unset', () => {
        expect(resolvePort({}, true)).toBe(8080);
    });

    it('uses PORT when set, regardless of packaging', () => {
        expect(resolvePort({ PORT: '1234' }, false)).toBe(1234);
        expect(resolvePort({ PORT: '1234' }, true)).toBe(1234);
    });
});

describe('formatBanner', () => {
    it('announces the listening address, core version and node version', () => {
        const [firstLine] = formatBanner(8080, false, {});
        expect(firstLine).toContain('http://localhost:8080');
        expect(firstLine).toMatch(/node v?\d+\.\d+\.\d+/);
    });

    it('is a single line when not packaged', () => {
        const lines = formatBanner(8080, false, {
            eth0: [{ address: '10.0.0.5', family: 'IPv4', internal: false } as never],
        });
        expect(lines).toHaveLength(1);
    });

    it('lists non-internal IPv4 LAN addresses when packaged', () => {
        const lines = formatBanner(8080, true, {
            eth0: [
                { address: '10.0.0.5', family: 'IPv4', internal: false } as never,
                { address: '::1', family: 'IPv6', internal: false } as never,
                { address: '127.0.0.1', family: 'IPv4', internal: true } as never,
            ],
            lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never],
        });
        expect(lines).toHaveLength(2);
        expect(lines[1]).toContain('10.0.0.5:8080');
    });
});
