# Scan Levels Mechanic - Design Spec

**Status:** Complete | **Created:** 2025-11-08 | **Issues:** #1205

## 1. Overview

**Purpose:** Implement fog-of-war mechanic where space objects reveal information progressively based on active scanning by Signals station.

**Scope:**
- 3 scan levels per faction: Lvl0 (UFO), Lvl1 (Basic), Lvl2 (Advanced)
- Active scanning via Signals Jobs system
- Persistent scan levels (no decay)
- Shared scan data across same-faction ships

**Out of Scope:**
- Passive proximity-based scanning (requires active job)
- Time-based decay mechanics
- Individual per-ship scan tracking

## 2. Requirements

**Functional:**
- Each SpaceObject has scan level property (per faction)
- Scan levels managed by SpaceManager
- Signals station can queue Scan jobs to upgrade levels
- All radars display objects according to faction's scan level
- Scan levels persist indefinitely once achieved
- Scan data shared across all ships in same faction

**Non-Functional:**
- Performance: Support 100+ objects with per-faction scan tracking
- Usability: Clear visual distinction between scan levels on radar
- Compatibility: Works with existing radar widgets (tactical, dradis, long-range)

## 3. Game Design

**Mechanics:**

**3 Scan Levels:**
1. **Lvl0 (UFO)** - Default state, minimal info
   - Visible: Distance, heading, relative speed (physics only)
   - Hidden: Faction, model, systems, damage

2. **Lvl1 (Basic)** - Faction identification
   - Visible: All Lvl0 + Faction, Ship Model
   - Hidden: Systems list, damage reports, armor status

3. **Lvl2 (Advanced)** - Full intelligence
   - Visible: All Lvl1 + System list, Damage reports, Armor status
   - Hidden: Nothing

**Progression:**
- Objects start at Lvl0 for all factions
- Signals station queues "Scan" job to upgrade
- Lvl0 → Lvl1: 15-30 seconds (base duration)
- Lvl1 → Lvl2: 30-60 seconds (2x duration)
- Duration affected by Signals system effectiveness
- Success rate: 70-90% (based on system health/malfunction)

**Persistence:**
- Scan levels never decay
- Once Lvl2, always Lvl2 (for that faction)
- Rewards exploration and intelligence gathering
- No maintenance burden on Signals officer

**Faction Sharing:**
- Scan levels stored per faction, not per ship
- If Ship A (UCS) scans enemy to Lvl2, all UCS ships see Lvl2
- Encourages multi-ship coordination
- Federation scan data ≠ UCS scan data (separate tracking)

**Balance:**
- Active scanning creates gameplay loop for Signals station
- Persistent levels reward time investment
- Shared data encourages teamwork
- Job queue limits (9 jobs) prevent spam
- Malfunction increases failure rate and slows execution

**Interactions:**
- **Signals Jobs**: Scan is primary job type
- **Hack Jobs**: Require Lvl2 scan (can't hack unknown targets)
- **Radar Widgets**: Display objects filtered by scan level
- **Target Info Widget**: Shows data based on current scan level

## 4. Technical

**State:**
```typescript
// SpaceState (server-side, synced)
class SpaceObjectBase extends Schema {
  // Existing fields...

  @gameField('map', { string: 'uint8' })
  scanLevels = new MapSchema<number>(); // Key: faction name, Value: 0-2
}
```

**Data Model:**
```typescript
enum ScanLevel {
  UFO = 0,      // Unknown - physics only
  BASIC = 1,    // Faction + model
  ADVANCED = 2  // Full intel (systems, damage)
}

interface ScanLevelData {
  targetId: string;
  faction: string;
  currentLevel: ScanLevel;
  timestamp: number; // When level was achieved
}
```

**Sync:**
- **What:** `scanLevels` MapSchema on each SpaceObject
- **Frequency:** On change (when Scan job completes)
- **Authority:** Server-only (SpaceManager manages)
- **Size:** ~2 bytes per faction per object (uint8 map)

**API:**

*Commands:*
```typescript
// Via Signals Jobs system (see SIGNALS_JOBS_DESIGN.md)
room.send('queueJob', {
  jobType: 'scan',
  targetId: 'ship-123'
});
```

*JSON Pointer:*
```typescript
// Read current scan level for faction
`/SpaceObject/${objectId}/scanLevels/${factionName}`
```

*Methods:*
```typescript
class SpaceManager {
  // Set scan level for target (called by job completion)
  setScanLevel(targetId: string, faction: string, level: ScanLevel): void

  // Get scan level for target (used by radar widgets)
  getScanLevel(targetId: string, faction: string): ScanLevel

  // Check if scan job can proceed (target in range, valid level)
  canScan(scannerId: string, targetId: string): boolean
}
```

**Integration:**

*Modified Classes:*
- `SpaceObjectBase` - Add `scanLevels` MapSchema
- `SpaceManager` - Add scan level management methods
- All radar widgets (Tactical, Dradis, Navigator, Relay) - Filter display by scan level
- `TargetInfoWidget` (Signals) - Show data based on scan level

*New Classes:*
- None (uses existing Signals Jobs system)

*Dependencies:*
- Signals Jobs system (#1206) - Scan job type
- Existing radar widgets - Display filtering

**Performance:**

*Complexity:*
- Storage: O(objects × factions) - ~100 objects × 2 factions = 200 entries
- Lookup: O(1) - MapSchema hash lookup
- Update: O(1) - Single entry update per job

*Optimizations:*
- Use uint8 for levels (0-2) instead of strings
- MapSchema sync only changes, not full map
- Lazy initialization (only store non-zero levels)

## 5. UX

**UI:**

*Radar Widgets (All Types):*
- **Lvl0 (UFO):** Gray/white dot, "UNKNOWN" label, distance/heading only
- **Lvl1 (Basic):** Faction color dot, ship model name, faction icon
- **Lvl2 (Advanced):** Full icon, damage indicators, system status

*Target Info Widget (Signals Station):*
- **Lvl0:** Physics data only (distance: 5234u, heading: 045°, speed: 234m/s)
- **Lvl1:** + Faction (Federation), Model (Destroyer class)
- **Lvl2:** + Systems list, damage reports, armor %, power levels

*Job List Widget (Signals Station):*
- Show "Scanning..." progress bar
- Display estimated time: "Scanning UCS Cruiser (Lvl1→Lvl2): 35s remaining"
- On completion: Target info panel updates immediately

**Interactions:**

*Signals Officer:*
1. Select unknown target on long-range radar
2. Click "Scan" button or hotkey (S)
3. Job added to queue: "Scan UNKNOWN-47 (Lvl0→Lvl1)"
4. Wait 15-30s (progress bar visible)
5. On success: Target info updates, faction/model revealed
6. Select same target again, queue another scan for Lvl2
7. Wait 30-60s
8. On success: Full intel revealed (systems, damage)

*All Officers (Radar):*
- See scan level visually on radar (color, icon detail)
- Hover tooltip shows: "UNKNOWN (Scan Lvl0)" or "UCS Destroyer (Scan Lvl2)"

**Feedback:**

*Visual:*
- Target info panel populates new data immediately on success
- Radar icon transitions from generic → faction-colored → detailed
- Job list shows green checkmark on success, red X on failure

*Audio:*
- Success: High beep (optional, see Signals Jobs design)
- Failure: Low buzz (optional)

*Haptic:*
- None

**Flows:**

*Scan Unknown Object (Lvl0 → Lvl1):*
1. Unknown object detected on long-range radar (gray dot, "UNKNOWN-47")
2. Signals officer clicks target, sees physics data only
3. Clicks "Scan" button
4. Job queued: "Scanning UNKNOWN-47 (Lvl0→Lvl1) - 20s"
5. Progress bar animates
6. After 20s: Success (70-90% chance)
   - Target info updates: "Federation Destroyer class"
   - Radar icon changes to blue (Federation color)
   - All UCS ships see updated icon
7. On failure: Job removed, no level change, can retry

*Deep Scan Known Object (Lvl1 → Lvl2):*
1. Federation Destroyer visible at Lvl1 (blue icon, model name)
2. Signals officer selects target
3. Clicks "Scan" (same button, auto-detects level)
4. Job queued: "Deep Scanning Federation Destroyer (Lvl1→Lvl2) - 45s"
5. Progress bar animates (2x duration)
6. After 45s: Success
   - Target info shows full intel: systems (Weapons: 80%, Engines: 100%, Shields: 45%), damage reports, armor status
   - All UCS ships can see full intel on this target
7. Scan level persists forever (no re-scanning needed)

*Job Interrupted (Target Out of Range):*
1. Job in progress: "Scanning UCS Cruiser - 15s remaining"
2. Target moves out of radar range
3. Job fails immediately, removed from queue
4. No scan level change
5. Signals officer must re-queue when target returns

## 6. Testing

**Unit Tests:**

*Scan Level Management:*
```typescript
describe('SpaceManager.setScanLevel', () => {
  it('should set scan level for faction', () => {
    const target = createTestShip();
    spaceManager.setScanLevel(target.id, 'UCS', ScanLevel.BASIC);
    expect(spaceManager.getScanLevel(target.id, 'UCS')).toBe(ScanLevel.BASIC);
  });

  it('should keep scan levels independent per faction', () => {
    const target = createTestShip();
    spaceManager.setScanLevel(target.id, 'UCS', ScanLevel.ADVANCED);
    spaceManager.setScanLevel(target.id, 'Federation', ScanLevel.UFO);
    expect(spaceManager.getScanLevel(target.id, 'UCS')).toBe(ScanLevel.ADVANCED);
    expect(spaceManager.getScanLevel(target.id, 'Federation')).toBe(ScanLevel.UFO);
  });

  it('should persist scan levels (no decay)', () => {
    const target = createTestShip();
    spaceManager.setScanLevel(target.id, 'UCS', ScanLevel.ADVANCED);
    // Simulate time passing
    jest.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
    expect(spaceManager.getScanLevel(target.id, 'UCS')).toBe(ScanLevel.ADVANCED);
  });
});
```

*Scan Job Validation:*
```typescript
describe('SpaceManager.canScan', () => {
  it('should allow scan if target in radar range', () => {
    const scanner = createTestShip({ radarRange: 5000 });
    const target = createTestShip({ position: { x: 3000, y: 0 } });
    expect(spaceManager.canScan(scanner.id, target.id)).toBe(true);
  });

  it('should block scan if target out of range', () => {
    const scanner = createTestShip({ radarRange: 5000 });
    const target = createTestShip({ position: { x: 8000, y: 0 } });
    expect(spaceManager.canScan(scanner.id, target.id)).toBe(false);
  });
});
```

**Integration Tests (ShipTestHarness):**

*Multi-Ship Scan Sharing:*
```typescript
it('should share scan levels across same faction ships', async () => {
  const { ship: ship1 } = await createTestShip({ faction: 'UCS' });
  const { ship: ship2 } = await createTestShip({ faction: 'UCS' });
  const { ship: enemy } = await createTestShip({ faction: 'Federation' });

  // Ship1 scans enemy to Lvl2
  await ship1.sendCommand('queueJob', { jobType: 'scan', targetId: enemy.id });
  await advanceTime(20000); // Lvl0→Lvl1
  await ship1.sendCommand('queueJob', { jobType: 'scan', targetId: enemy.id });
  await advanceTime(40000); // Lvl1→Lvl2

  // Ship2 should see Lvl2 without scanning
  expect(spaceManager.getScanLevel(enemy.id, 'UCS')).toBe(ScanLevel.ADVANCED);
});
```

*Scan Job Failure on Range Loss:*
```typescript
it('should fail scan job if target leaves range', async () => {
  const { ship, room } = await createTestShip();
  const { ship: target } = await createTestShip();

  // Queue scan job
  room.send('queueJob', { jobType: 'scan', targetId: target.id });
  await advanceTime(5000); // Job in progress

  // Move target out of range
  target.position.x = 20000;
  await advanceTime(100);

  // Job should fail and be removed
  expect(ship.signalsJobs.length).toBe(0);
  expect(spaceManager.getScanLevel(target.id, ship.faction)).toBe(ScanLevel.UFO);
});
```

**E2E Tests (Playwright):**

*Signals Officer Scanning Workflow:*
```typescript
test('signals officer can scan unknown target to reveal intel', async ({ page }) => {
  await page.goto('http://localhost:3000/ship/test-ship-1/signals');

  // Unknown target visible
  await expect(page.locator('[data-id="LongRangeRadar"]')).toContainText('UNKNOWN');

  // Select target and scan
  await page.click('[data-target-id="enemy-1"]');
  await page.click('[data-action="scan"]');

  // Job appears in queue
  await expect(page.locator('[data-id="JobsList"]')).toContainText('Scanning UNKNOWN-1 (Lvl0→Lvl1)');

  // Wait for completion
  await page.waitForSelector('[data-job-status="success"]', { timeout: 30000 });

  // Target info updates
  await expect(page.locator('[data-id="TargetInfo"]')).toContainText('Federation');
  await expect(page.locator('[data-id="TargetInfo"]')).toContainText('Destroyer');

  // Radar updates
  await expect(page.locator('[data-target-id="enemy-1"]')).toHaveClass(/faction-federation/);
});
```

## 7. Implementation

**Phase 1: Data & State (2-3 hours)**
- Add `scanLevels` MapSchema to `SpaceObjectBase`
- Add scan level methods to `SpaceManager`
- Write unit tests for scan level storage/retrieval
- Test persistence (no decay)
- Test faction independence

**Phase 2: Integration with Jobs System (3-4 hours)**
- Implement `canScan()` validation (range check)
- Add scan level upgrade logic to Scan job completion
- Test job success/failure cases
- Test range-based interruption
- Test multi-ship scan sharing

**Phase 3: Radar Widget Display (4-5 hours)**
- Update Tactical Radar to filter by scan level
- Update Dradis Radar to filter by scan level
- Update Long-Range Radar (Signals) to filter by scan level
- Update Navigator Radar to filter by scan level
- Add visual distinction (color, icon, label) per level
- Add hover tooltips showing scan level

**Phase 4: Target Info Widget (2-3 hours)**
- Update Target Info to show data by scan level
- Lvl0: Physics only
- Lvl1: + Faction, Model
- Lvl2: + Systems, Damage, Armor
- Test immediate updates on scan completion

**Phase 5: E2E & Polish (2-3 hours)**
- E2E test: Scan Lvl0→Lvl1→Lvl2 workflow
- E2E test: Multi-ship scan sharing
- E2E test: Job interruption on range loss
- Performance test: 100 objects × 2 factions
- Documentation updates

**Total Effort:** 13-18 hours (2-3 days)

## 8. Open Questions

**Critical:** ✅ All resolved

**Important:** ✅ All resolved

**Nice-to-Have:**
- **Visual scan beam effect?** - *Art team, low impact* - Could add visual "scanning" beam from scanner to target for flavor
- **Audio cues for scan completion?** - *Sound design, low impact* - Defer to Signals Jobs design for audio feedback
- **Scan level indicator on radar HUD?** - *UX, medium impact* - Could add Lvl0/1/2 badge on radar icons for clarity

## 9. References

**Issues:** #1205 (Scan Levels Mechanic)
**Similar:** Faction tracking, Radar filtering
**Docs:**
- `docs/MS3/SIGNALS_JOBS_DESIGN.md` (companion design)
- `docs/SUBSYSTEMS.md` (system effectiveness formulas)
- `docs/API_REFERENCE.md` (JSON Pointer commands)

**Dependencies:**
- #1206 (Signals Jobs System) - Scan job type implementation
- Existing radar widgets - Display filtering

**Next Steps:**
1. ✅ Design complete - review with stakeholders
2. Await approval
3. Create implementation issues (can split into 5 phases if needed)
4. Estimate in GitHub
5. Add to Phase 1 backlog (blocks #1206, #1208)
