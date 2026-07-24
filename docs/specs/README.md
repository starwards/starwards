# Specs — as-built code contracts

How the code is structured today: state, commands, decorators, widgets, and the naming and
file-organization conventions that hold across modules. These describe what exists — for
forward-looking build contracts for a single scoped change, see the
[starwards-design](https://github.com/starwards/starwards-design) `specs/` register.

| Spec | Covers |
|---|---|
| [`STATE_MANAGEMENT_SPEC.md`](STATE_MANAGEMENT_SPEC.md) | State containers, sync, and the source-of-truth rules. |
| [`COMMAND_SYSTEM_SPEC.md`](COMMAND_SYSTEM_SPEC.md) | Typed commands and JSON Pointer command routing. |
| [`DECORATORS_SPEC.md`](DECORATORS_SPEC.md) | `@gameField`, `@tweakable`, `@range` and decorator ordering. |
| [`SHIP_SYSTEMS_SPEC.md`](SHIP_SYSTEMS_SPEC.md) | Ship subsystem model and effectiveness. |
| [`SPACE_OBJECTS_SPEC.md`](SPACE_OBJECTS_SPEC.md) | `SpaceObjectBase` and its subtypes. |
| [`WIDGET_SYSTEM_SPEC.md`](WIDGET_SYSTEM_SPEC.md) | Widget registration and the dashboard/container systems. |
| [`FILE_ORGANIZATION_SPEC.md`](FILE_ORGANIZATION_SPEC.md) | Where code lives across `modules/`. |
| [`NAMING_CONVENTIONS_SPEC.md`](NAMING_CONVENTIONS_SPEC.md) | Naming rules; see also [`../standards/standards-naming.md`](../standards/standards-naming.md). |
