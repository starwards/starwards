/* global app, send, receive, loadJSON */
/* eslint-disable no-console */
/**
 * Starwards OSC Bridge — Custom Module (Open Stage Control)
 *
 * Responsibilities:
 *  1. Per-client session routing: client connects with ?id=<station>,
 *     module calls /SESSION/OPEN for the matching session file.
 *  2. Subscription bootstrap: on session open, walks the session JSON,
 *     collects every widget address, and emits subscribe messages to
 *     Node-RED so ship-read wires up change listeners.
 *
 * Convention: widget OSC address = admitted JSON pointer.
 * Example: fader addressed /reactor/power → ship-read subscribes /reactor/power
 * and pushes current + future values back; O-S-C updates the display without
 * re-emitting (plain inbound match, no loop).
 *
 * Architecture (write path):
 *   tablet → O-S-C widget interaction → UDP OSC → Node-RED udp-in
 *   → osc decode → ship-write (JSON-pointer admission enforced)
 *
 * Architecture (feedback path):
 *   ship-read subscribe output → rate-limit → osc encode
 *   → Node-RED udp-out → O-S-C :57120 → widget display update (no re-emit)
 *
 * Node-RED subscribe message format (sent as synthetic OSC to Node-RED):
 *   address: /starwards/subscribe
 *   args: ["/reactor/power"]    ← JSON pointer to subscribe
 * Node-RED function node routes this to ship-read with { topic, subscribe: true }.
 */

const NODE_RED_HOST = 'node-red';
const NODE_RED_PORT = 57121;
const SESSIONS_DIR = '/sessions';

/**
 * Recursively collect every widget's OSC address from a session JSON tree.
 * @param {object} widget - Session widget node
 * @param {string[]} out - Accumulator
 */
function collectAddresses(widget, out) {
    if (typeof widget.address === 'string' && widget.address.startsWith('/')) {
        out.push(widget.address);
    }
    for (const child of widget.widgets ?? []) {
        collectAddresses(child, out);
    }
}

/**
 * Send a synthetic subscribe message to Node-RED for a widget address.
 * Node-RED receives: msg.topic = '/starwards/subscribe', msg.payload = [address]
 * A function node then routes to ship-read with { topic: address, subscribe: true }.
 */
const sendSubscribe = (address) => send(NODE_RED_HOST, NODE_RED_PORT, '/starwards/subscribe', address);

module.exports = {
    init: () => {
        // Per-client session routing: resolve station session from ?id= URL param
        app.on('open', (data, client) => {
            const stationId = client?.id; // client.id is set from ?id= by O-S-C
            if (!stationId) return;

            // Ask O-S-C to open that station's session for this client
            receive('/SESSION/OPEN', `${SESSIONS_DIR}/${stationId}.json`, { clientId: stationId });
        });

        // Subscription bootstrap: after session opens, subscribe to every widget address
        app.on('sessionOpened', (data, client) => {
            const clientId = client?.id;
            if (!clientId || !data?.path) return;

            const session = loadJSON(data.path, (err) => {
                console.error('[starwards-bridge] failed to load session:', err);
            });
            if (!session) return;

            const addresses = [];
            collectAddresses(session.content ?? session, addresses);
            const unique = new Set(addresses);
            console.log(`[starwards-bridge] subscribing ${unique.size} addresses for ${clientId}`);
            setTimeout(() => unique.forEach(sendSubscribe), 1000);
        });
    },

    stop: () => {},
};
