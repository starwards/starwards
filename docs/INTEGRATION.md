# Integration Guide - Starwards

**External integrations and custom extensions**

This page is an index. Each integration surface has its own audience and now its own doc:

- [`integration/node-red.md`](integration/node-red.md) - Visual-programming bridge to ship state: nodes, example flows, connection lifecycle, error handling.
- [`integration/mcp-server.md`](integration/mcp-server.md) - MCP server that seats an LLM at a station, sandboxed to what that seat can see and do.
- [`integration/docker.md`](integration/docker.md) - Docker Compose setup for the MQTT and Node-RED services, service URLs, and volume backup/restore.
- [`integration/open-stage-control.md`](integration/open-stage-control.md) - Touchscreen/MIDI control surfaces (O-S-C) bridged to ship state through Node-RED.
- [`integration/mqtt.md`](integration/mqtt.md) - Pub/sub bridging for external systems (lights, sound) via Node-RED.
- [`integration/extending.md`](integration/extending.md) - Adding a custom widget, a new ship system, or a new space object type.

## Related Documentation

- [LLM_CONTEXT.md](LLM_CONTEXT.md) - Quick-start guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [API_REFERENCE.md](API_REFERENCE.md) - API documentation
- [PATTERNS.md](PATTERNS.md) - Code patterns
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development workflows
- [CLAUDE.md](../CLAUDE.md) - Original developer guide
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
