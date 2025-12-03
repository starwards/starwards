# Retrospective: Ship Room Lifecycle Management (Issue #1238)

**Date**: 2025-11-09
**Branch**: `claude/github-api-ship-room-lifecycle-011CUxBE36CDakh1T9RjLce3`
**Commits**:
- `9d10918` - feat: add ship room lifecycle management API and GUI
- `cca8cee` - fix: only create ship rooms for player ships, not NPCs

---

## Key Architectural Learning: NPCs Don't Need Rooms

### Initial Misunderstanding
I initially implemented ship room creation for **all** ships (both player and NPC), assuming every ship needed a Colyseus room.

### Correction
**NPCs don't need rooms. Only player ships do.**

### Architecture Pattern

```
Player Ships (ShipManagerPc):
├── ShipManager instance
├── ShipRoom (Colyseus room for client connections)
└── Updated via GameManager.update() loop

NPC Ships (ShipManagerNpc):
├── ShipManager instance only
├── No room needed
└── Updated via GameManager.update() loop
```

### Why This Matters

**Rooms are for client connections:**
- Player ships need rooms because human players connect to control them
- NPCs are AI-controlled and don't need client connections
- Creating unnecessary rooms wastes resources

**Update mechanism is separate:**
- Both manager types get `update()` called every frame by `GameManager.update()` (line 65-66)
- The update loop iterates through `this.shipManagers.values()` which includes both types
- No room required for updates to work

---

## Implementation Details

### Files Modified

1. **modules/core/src/ship/ship-state.ts**
   - Added `@tweakable('boolean')` to `isPlayerShip` property
   - Makes it editable in the GUI tweak panel

2. **modules/server/src/admin/game-manager.ts**
   - Modified `initShipManagerAndRoom()` to conditionally create rooms:
     - Player ships (isPlayerShip=true): Create room + manager
     - NPC ships (isPlayerShip=false): Create manager only
   - Added `convertShipType()` method for dynamic conversion
   - Updated `waitForAllShipRoomsInit()` to only wait for player ship rooms

3. **modules/browser/src/widgets/tweak.ts**
   - Changed `isPlayerShip` from read-only text to editable checkbox
   - Used `readWriteProp()` instead of `readProp()`
   - Used `addInputBlade()` instead of `addTextBlade()`

4. **modules/server/src/server.ts**
   - Added `/convert-ship-type` HTTP endpoint
   - Accepts `{ shipId: string, isPlayerShip: boolean }`

### Ship Type Conversion Flow

When converting between player/NPC types:

1. Check if conversion is needed (current type vs target type)
2. Update `shipState.isPlayerShip` property
3. Clean up existing manager (and room if player ship)
4. Recreate manager with correct type:
   - Player ship: Creates ShipManagerPc + ShipRoom
   - NPC: Creates ShipManagerNpc (no room)

---

## Test Coverage Verification

### How to Verify NPCs Work Without Rooms

**Question**: What calls the NPC ship manager update?
**Answer**: `GameManager.update()` at line 65-66

```typescript
for (const shipManager of this.shipManagers.values()) {
    shipManager.update(iterationData);
}
```

### Existing Test Coverage

1. **Parameterized Unit Tests**
   - `modules/core/test/ship-manager.spec.ts`: Tests both `ShipManagerPc` and `ShipManagerNpc`
   - `modules/core/test/space-manager.spec.ts`: Tests both manager types

2. **Simulator Tests**
   - `modules/core/test/simulator.ts`: `SpaceSimulator` accepts both manager types
   - Directly calls `update()` in simulation loops

3. **Integration Tests**
   - `modules/server/src/test/multi-client-concurrent.spec.ts`
   - `modules/server/src/test/server-api.spec.ts`
   - Both use `two_vs_one` map which includes an NPC ship:
     ```typescript
     game.addNpcSpaceship(newShip('R2D2', Faction.Raiders, 'dragonfly-SF22'));
     ```

---

## Lessons Learned

### 1. Question Initial Assumptions
When I assumed all ships needed rooms, the user corrected me. Always verify architectural assumptions, especially around resource allocation (rooms, connections, etc.).

### 2. Understand the "Why" Behind Architecture
- Rooms = Client connections
- Managers = Game logic
- These are separate concerns

### 3. Check Both Happy Path and Resource Efficiency
The initial implementation worked functionally but wasted resources. Performance and efficiency matter.

### 4. Trace Update Mechanisms
When asked "what calls the update?", I traced through:
- `GameManager.update()` → loops through `shipManagers` → calls `update()`
- This helped verify the architecture was sound

### 5. Test Coverage is Your Friend
When questioning if something works, look for:
- Parameterized tests (`describe.each`)
- Integration tests with real scenarios
- Simulator/harness tests

---

## Future Considerations

### If Working on Ship Managers Again

1. **Always distinguish between Player and NPC ships**
   - Different manager types (ShipManagerPc vs ShipManagerNpc)
   - Different resource requirements
   - Different capabilities (energy management, heat, movement)

2. **Room creation is conditional**
   - Check `isPlayerShip` flag
   - Only create rooms when needed for client connections

3. **Cleanup must match creation**
   - Player ships: Cleanup manager + disconnect room
   - NPCs: Cleanup manager only

### Related Code Patterns

- `shipConfigurations` - Ship design templates
- `makeShipState()` - Factory for creating ship state
- `shipManagers.values()` - Iteration over all ship managers
- `playerShipIds` vs `shipIds` - Track which ships have rooms

---

## Issue #1238 Completion

### Original Requirements
- ✅ Extract API for opening and closing ship room
- ✅ Set a state property "player ship"
- ✅ Open ship rooms in default map init (already done)
- ✅ Close ship room on ship destroyed (already done)
- ✅ Add GUI for opening and closing ship rooms in tweak panel

### Final Implementation
- `isPlayerShip` is now tweakable in the GUI
- `/convert-ship-type` API endpoint for programmatic control
- Proper room lifecycle: create only for player ships, cleanup correctly
- Dynamic conversion between player/NPC types at runtime

---

## Code Review Insights

### What the User Taught Me

**"NPCs don't need rooms. The ShipManagerNpc should operate without one."**

This single correction fundamentally changed the implementation from:
- ❌ All ships get rooms (wasteful, architecturally incorrect)
- ✅ Only player ships get rooms (efficient, correct separation of concerns)

### Why This Matters for LLMs

As an AI, I can read code patterns but may miss the **intent** behind architectural decisions. Human developers understand:
- Resource efficiency (rooms are expensive)
- Separation of concerns (rooms ≠ managers)
- The "why" behind code structure

Always be ready to question and refine initial implementations based on domain expertise.

---

## References

- Issue: #1238 (Manage ship room lifecycle)
- Maps: `modules/server/src/maps.ts` (see `two_vs_one` for NPC example)
- Game loop: `modules/server/src/admin/game-manager.ts:51-79`
- Room definition: `modules/server/src/ship/room.ts`
- Manager types: `modules/core/src/ship/ship-manager.ts`
