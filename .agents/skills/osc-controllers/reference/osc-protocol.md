# OSC protocol essentials

Enough to implement/debug the bridge. Spec: CNMAT Open Sound Control 1.0.

## Message encoding

An OSC message = **address pattern** + **type tag string** + **arguments**, each part padded with NULs to 4-byte boundaries.

- Address: ASCII string starting `/`, segments separated by `/` (e.g. `/reactor/power`).
- Type tag string: starts with `,`, one tag per argument (e.g. `,if` = int then float).
- Arguments: binary, big-endian, in tag order.

## Type tags

| Tag | Type | Notes |
|---|---|---|
| `i` | int32 | |
| `f` | float32 | Most O-S-C numeric values default to this |
| `s` | OSC-string | NUL-terminated, 4-byte padded |
| `b` | blob | int32 size + bytes, padded |
| `T`/`F` | true/false | no argument bytes |
| `N` | nil | no argument bytes |
| `d`, `h`, `t` | double, int64, timetag | extensions, not universally supported |

Int vs float matters: a receiver expecting `f` may ignore `,i` messages. When exact types matter, send explicit `{type, value}` objects (both O-S-C scripting and node-red-contrib-osc support this convention).

## Bundles

`#bundle` + 8-byte timetag + length-prefixed elements (messages or nested bundles). Timetag `1` means "immediately". The bridge doesn't need bundles; expect O-S-C to send plain messages.

## Transport

- **UDP** (default, what this framework uses): one datagram = one packet, no framing needed. Messages > MTU will fragment — keep layouts' values small (they are).
- **TCP**: byte stream needs framing — OSC 1.0 style uses int32 length prefix; OSC 1.1 uses **SLIP** encoding (END byte `0xC0` delimiters). Node-RED needs `node-red-contrib-slip` between `tcp` nodes and the `osc` node. Only relevant if UDP proves unreliable on the LAN.

## Pattern matching

The OSC spec defines address wildcards (`?` `*` `[]` `{}`) matched by the RECEIVER against its method addresses. Open Stage Control matches addresses **literally** (no wildcard interpretation), so JSON-Pointer addresses are safe. Avoid `#`, spaces, and wildcard characters inside address segments anyway — some tools mis-handle them.
