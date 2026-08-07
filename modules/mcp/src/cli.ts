#!/usr/bin/env node
import { Driver } from '@starwards/core/internal';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from './server';

// stdout is the protocol channel: one stray line of human-readable text on it and the client's JSON
// parser gives up on the session. `createLogger` routes its info channel to console.log, and any
// dependency may do the same, so console.log is moved to stderr for the life of the process rather
// than trusting every caller to remember.
// eslint-disable-next-line no-console
console.log = console.error.bind(console);

function log(message: string) {
    process.stderr.write(`starwards:mcp ${message}\n`);
}

/** A bare host:port is the common way to write a game server address, so accept it. */
export function withDefaultProtocol(url: string): string {
    return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url) ? url : `http://${url}`;
}

function readUrlArg(argv: string[]): string {
    const flagIndex = argv.indexOf('--url');
    if (flagIndex >= 0 && argv[flagIndex + 1]) {
        return argv[flagIndex + 1];
    }
    return process.env.STARWARDS_URL || 'http://localhost:8080';
}

async function main() {
    const baseUrl = new URL(withDefaultProtocol(readUrlArg(process.argv.slice(2))));
    const driver = new Driver(baseUrl).connect(1_000);
    const server = buildMcpServer(driver, baseUrl);
    log(`connecting to ${baseUrl.href}`);
    await server.connect(new StdioServerTransport());
}

main().catch((e: unknown) => {
    log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
});
