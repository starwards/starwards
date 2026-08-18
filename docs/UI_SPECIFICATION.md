# Starwards SBS UI Specification

**Version:** 1.1
**Date:** 2026-08-18
**Purpose:** Index of the implementation inventory for all UI screens and components (mounted widgets, source files, data bindings, workflows, pain points). For design intent and build status per station, see [`docs/design/stations/`](design/stations/README.md).

This document was split by screen for maintainability — each screen's full spec now lives in its own file under [`docs/ui/`](ui/):

- [`ui/pilot-screen.md`](ui/pilot-screen.md) — Pilot screen (flight controls, navigation)
- [`ui/engineer-screen.md`](ui/engineer-screen.md) — Engineer screen (power, coolant, damage control)
- [`ui/weapons-screen.md`](ui/weapons-screen.md) — Weapons screen (targeting, tubes, ammunition)
- [`ui/gm-screen.md`](ui/gm-screen.md) — GM screen (scenario control, god-mode dashboard)
- [`ui/ship-screen.md`](ui/ship-screen.md) — Ship screen (customizable multi-widget dashboard)
- [`ui/input-screen.md`](ui/input-screen.md) — Input screen (gamepad testing/debugging)
- [`ui/common-ui-patterns.md`](ui/common-ui-patterns.md) — Shared UI architecture, Tweakpane/PixiJS/input code patterns, cross-screen technical constraints (performance, browser compatibility, network sync, accessibility, persistence) and glossary

## Overview

The Starwards Space Bridge Simulator (SBS) UI consists of station-specific screens designed for multiplayer cooperative gameplay. Each station controls different aspects of a spaceship, requiring specialized interfaces optimized for their role.

### Design Philosophy
- **Station-specific**: Each screen tailored to specific crew role
- **Real-time**: All data synchronized via Colyseus WebSocket
- **Multi-input**: Keyboard, gamepad, and mouse support
- **Information density**: Critical data always visible

---

**This document is an index only.** For screen-level detail (widgets, data sources, workflows, pain points, technical constraints), follow the links above. Shared architecture, code patterns, cross-cutting technical constraints, and the glossary live in [`ui/common-ui-patterns.md`](ui/common-ui-patterns.md).
