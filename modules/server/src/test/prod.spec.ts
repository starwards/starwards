import { formatBanner, openCommand, resolvePort, waitForKeypress } from '../prod';
import { VERSION } from '@starwards/core';

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
        expect(firstLine).toContain(VERSION);
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

    it('orders LAN addresses so the likeliest home/office range comes first', () => {
        const lines = formatBanner(8080, true, {
            eth0: [
                { address: '203.0.113.9', family: 'IPv4', internal: false } as never,
                { address: '192.168.1.7', family: 'IPv4', internal: false } as never,
            ],
        });
        expect(lines[1]).toContain('192.168.1.7');
        expect(lines[2]).toContain('203.0.113.9');
    });
});

describe('openCommand', () => {
    it('opens with the platform default browser on Windows', () => {
        expect(openCommand('win32', 'http://localhost:8080/')).toBe('start "" "http://localhost:8080/"');
    });

    it('opens with xdg-open on Linux', () => {
        expect(openCommand('linux', 'http://localhost:8080/')).toBe('xdg-open "http://localhost:8080/"');
    });

    it('opens with open on macOS', () => {
        expect(openCommand('darwin', 'http://localhost:8080/')).toBe('open "http://localhost:8080/"');
    });

    it('has no known opener for other platforms', () => {
        expect(openCommand('aix', 'http://localhost:8080/')).toBeNull();
    });
});

describe('waitForKeypress', () => {
    it('resolves once stdin emits data', async () => {
        const settled = jest.fn();
        const promise = waitForKeypress().then(settled);
        expect(settled).not.toHaveBeenCalled();
        process.stdin.emit('data', Buffer.from('x'));
        await promise;
        expect(settled).toHaveBeenCalled();
        // waitForKeypress() resumes stdin (via `.resume()`/`setRawMode`) and never pauses it back —
        // undo that here so this test doesn't leave stdin open for the rest of the suite.
        process.stdin.pause();
    });
});
