/* global app, receive, loadJSON */
/* eslint-disable no-console */
/**
 * Starwards OSC Bridge — Custom Module (Open Stage Control v1.30.3)
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
 *   ship-read subscribe output → RBE → rate-limit → osc encode
 *   → Node-RED udp-out → O-S-C :57120 → widget display update (no re-emit)
 *
 * Node-RED subscribe message format (sent as synthetic OSC to Node-RED):
 *   address: /starwards/subscribe
 *   args: ["/reactor/power"]    ← JSON pointer to subscribe
 * Node-RED function node routes this to ship-read with { topic, subscribe: true }.
 */

var NODE_RED_HOST = '172.17.0.1'; // Docker host gateway; override via env if needed
var NODE_RED_PORT = 57121; // Node-RED udp-in port for subscribe messages
var SESSIONS_DIR = '/sessions';

/**
 * Recursively collect every widget's OSC address from a session JSON tree.
 * @param {object} widget - Session widget node
 * @param {string[]} out - Accumulator
 */
function collectAddresses(widget, out) {
    if (widget.address && typeof widget.address === 'string' && widget.address.startsWith('/')) {
        out.push(widget.address);
    }
    if (Array.isArray(widget.widgets)) {
        for (var i = 0; i < widget.widgets.length; i++) {
            collectAddresses(widget.widgets[i], out);
        }
    }
}

/**
 * Send a synthetic subscribe message to Node-RED for a widget address.
 * Node-RED receives: msg.topic = '/starwards/subscribe', msg.payload = [address]
 * A function node then routes to ship-read with { topic: address, subscribe: true }.
 */
function sendSubscribe(address, clientId) {
    receive(NODE_RED_HOST, NODE_RED_PORT, '/starwards/subscribe', address, { clientId: clientId });
}

module.exports = {
    init: function () {
        // Per-client session routing: resolve station session from ?id= URL param
        app.on('open', function (data, client) {
            var clientId = client ? client.id : null;
            if (!clientId) return;

            // Extract ?id=<station> from the client's connection URL
            var stationId = clientId; // client.id is set from ?id= by O-S-C
            var sessionPath = SESSIONS_DIR + '/' + stationId + '.json';

            // Ask O-S-C to open that session for this client
            receive('/SESSION/OPEN', sessionPath, { clientId: clientId });
        });

        // Subscription bootstrap: after session opens, subscribe to every widget address
        app.on('sessionOpened', function (data, client) {
            var clientId = client ? client.id : null;
            if (!clientId || !data || !data.path) return;

            var session = loadJSON(data.path, function (err) {
                console.error('[starwards-bridge] failed to load session:', err);
            });
            if (!session) return;

            var addresses = [];
            collectAddresses(session, addresses);

            // Deduplicate and send subscribe messages to Node-RED
            var seen = {};
            for (var i = 0; i < addresses.length; i++) {
                var addr = addresses[i];
                if (!seen[addr]) {
                    seen[addr] = true;
                    sendSubscribe(addr, clientId);
                }
            }
        });
    },

    stop: function () {
        // No persistent state to clean up
    },
};
