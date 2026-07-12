# node-red-contrib-osc

Package: `node-red-contrib-osc` (npm). Maintainer Nicholas Humfrey; latest **v1.1.0, published 2018-06-23** — stable/mature, not actively developed. Wraps the `osc` npm library (`osc.readPacket`/`osc.writePacket`). Transport-agnostic: pair it with `udp in`/`udp out` (this framework), or tcp/websocket/serial (+ `node-red-contrib-slip` for SLIP framing over TCP/serial).

## Decode (Buffer in → object out)

`udp in` (output: Buffer) → `osc` node. If `msg.payload` is a Buffer it decodes with `{metadata: <node setting>, unpackSingleArgs: true}` and sets:

- `msg.topic` = OSC address (e.g. `/reactor/power`)
- `msg.payload` = the argument(s) — single value unpacked, multiple as array
- Bundles: `msg.topic = "bundle"`, `msg.payload = packets[]`

With the node's **"include metadata"** checked, each arg is `{type: "f", value: 0.7}` instead of a bare value — enable this when the bridge must distinguish int/float/string.

## Encode (object in → Buffer out)

Non-Buffer payload → the node builds `{address: msg.topic, args: msg.payload}` and outputs a Buffer for `udp out`.

- Address comes from `msg.topic` (or the node's configured path); both empty → error "OSC Path is empty, please provide a path using msg.topic".
- `payload: ""` → zero-arg message; `payload: null` → single nil (`N`) arg.
- Bundles pass through with computed `timeTag` (numbers > 10,000,000 treated as absolute timestamps).

## Type casting (int vs float)

The `osc` library infers tags from JS types: integral numbers → `i`, non-integral → `f`. **`1.0` in JS is integral** → sent as int32. To force a float, use a metadata object:

```js
msg.topic = '/reactor/power'
msg.payload = { type: 'f', value: 1 }   // forces float32
return msg
```

Same convention O-S-C uses in its scripting `send()`. For ship pointer values that are always numeric, forcing `f` avoids int/float mismatches on round values.

## Reference flow shape (this repo)

```
[udp in :9000] → [osc decode] → [function: topic→JSON pointer] → [ship-write]
[ship-read] → [rbe] → [delay rate-limit per topic] → [function: pointer→topic] → [osc encode] → [udp out → O-S-C osc-port]
```

O-S-C matches the fed-back address literally against widget `address` + `preArgs`; the widget updates without re-emitting (no loop).
