# Signals Jobs System - Design Spec

**Status:** Complete | **Created:** 2025-11-08 | **Issues:** #1206

## 1. Overview

**Purpose:** Implement job queue system for Signals station allowing officers to perform intelligence operations (Scan, Hack, Track) on targets.

**Scope:**
- Job queue per ship (max 9 concurrent jobs)
- 3 job types: Scan, Hack, Track
- Auto-execute jobs sequentially, one at a time
- Malfunction effects: slower execution, higher failure rate
- Skill-based success rates (70-90% based on system health)
- Range-based validation (jobs fail if target out of range)

**Out of Scope:**
- Passive/automatic jobs (all require manual queuing)
- Multi-target jobs (one job = one target)
- Job prioritization/reordering (FIFO queue only)
- Job types: Jam (future), Intercept (future)

## 2. Requirements

**Functional:**
- Ship has job queue (max 9 jobs)
- Jobs execute sequentially (one active at a time)
- 3 job types: Scan (upgrade scan level), Hack (reduce system effectiveness), Track (maintain visibility beyond LOS)
- Jobs validate target in range before/during execution
- Jobs fail immediately if target destroyed or out of range
- Malfunction slows job execution and increases failure rate
- Success/failure affects target state (scan level, hacked status, tracked flag)

**Non-Functional:**
- Performance: Support 9 jobs per ship × 20 ships = 180 total jobs
- Usability: Clear job queue visualization, progress feedback
- Compatibility: Works with Signals station UI, integrates with scan levels

## 3. Game Design

**Mechanics:**

**Job Types:**

1. **Scan** - Upgrade target scan level
   - **Purpose:** Reveal target intel (Lvl0→Lvl1 or Lvl1→Lvl2)
   - **Duration:**
     - Lvl0→Lvl1: 15-30s (base)
     - Lvl1→Lvl2: 30-60s (2x duration)
   - **Success Rate:** 70-90% (based on Signals system effectiveness)
   - **Effect on Success:** Target scan level increases for faction
   - **Effect on Failure:** No change, can retry
   - **Requirements:** Target in radar range, not destroyed
   - **See Also:** `docs/MS3/SCAN_LEVELS_DESIGN.md`

2. **Hack** - Reduce target system effectiveness
   - **Purpose:** Sabotage specific enemy system (Weapons, Engines, Shields, etc.)
   - **Duration:** 30-60s (base)
   - **Success Rate:** 50-70% (based on Signals system effectiveness)
   - **Effect on Success:**
     - Target system operates at 50% effectiveness for 2-3 minutes
     - Hacked system shows degraded status on Engineering station
     - Target sees "SYSTEM COMPROMISED" alert
   - **Effect on Failure:** No change, can retry
   - **Requirements:**
     - Target at Scan Lvl2 (can't hack unknown targets)
     - Target in radar range
     - Signals officer selects which system to hack
   - **Cooldown:** Can't hack same system on same target for 1 minute after success

3. **Track** - Maintain visibility beyond line-of-sight
   - **Purpose:** Keep high-priority target visible for coordination
   - **Duration:** Instant activation, continuous until cancelled
   - **Success Rate:** 100% (always succeeds if in range)
   - **Effect on Success:**
     - Target visible on radar even behind obstacles (planets, nebulae)
     - Line-of-sight blocking removed, but range limits still apply
     - Tracked target shows "TRACKED" badge on radar
     - Track persists until target out of range or Signals officer cancels
   - **Effect on Failure:** N/A (always succeeds)
   - **Requirements:** Target in radar range, at least Scan Lvl1
   - **Limit:** Max 3 tracked targets simultaneously per ship

**Job Queue:**
- Max 9 jobs queued per ship
- Jobs execute sequentially (FIFO - first in, first out)
- Only 1 job active at a time
- Jobs show: target name/ID, job type, status (queued/in-progress/success/failed)
- Progress bar for active job
- Estimated time remaining based on duration and malfunction

**Malfunction Effects:**

*Signals System Effectiveness:*
```typescript
effectiveness = power × coolantFactor × (1 - hacked)
```

*Job Duration Modifier:*
```typescript
actualDuration = baseDuration / effectiveness
// Example: 30s base, 50% effectiveness = 60s actual
```

*Job Success Rate Modifier:*
```typescript
baseSuccessRate = 0.7 to 0.9 (per job type)
actualSuccessRate = baseSuccessRate × effectiveness
// Example: 80% base, 50% effectiveness = 40% actual
// Malfunction increases failure risk significantly
```

**Balance:**

*Queue Limits:*
- 9 jobs max prevents spam, encourages prioritization
- Sequential execution creates strategic choice (scan or hack first?)
- Track doesn't consume queue slot (instant activation, separate limit)

*Duration:*
- Medium durations (15-60s) balance engagement vs. frustration
- 2x duration for deep scan (Lvl2) rewards patience
- Malfunction can double/triple durations (encourage repair)

*Success Rates:*
- 70-90% for Scan: High success, low frustration
- 50-70% for Hack: Risky, high reward (50% system reduction)
- 100% for Track: Utility, always reliable
- Malfunction dramatically drops success (40-45%) - repair becomes critical

*Hack Effect:*
- 50% effectiveness reduction is severe (weapons fire slower, engines turn slower)
- 2-3 minute duration is long enough to matter, short enough to not frustrate
- Requires Lvl2 scan (must invest time to hack)
- System-specific targeting adds tactical depth

**Interactions:**

- **Scan Levels (#1205):** Scan jobs upgrade levels, Hack requires Lvl2
- **Signals Station (#1208):** Job queue widget, target selection, job controls
- **Target Ships:** Hacked systems show reduced effectiveness
- **Radar Widgets:** Tracked targets show "TRACKED" badge, visible through LOS blocks
- **Engineering Station:** Hacked systems show "COMPROMISED" warning

## 4. Technical

**State:**

```typescript
// ShipState (server-side, synced)
class ShipState extends Schema {
  // Existing fields...

  @gameField('array', SignalsJob)
  signalsJobs = new ArraySchema<SignalsJob>(); // Queue of jobs

  @gameField('array', 'string')
  trackedTargets = new ArraySchema<string>(); // Max 3 target IDs
}

class SignalsJob extends Schema {
  @gameField('string') id: string;           // Unique job ID
  @gameField('string') jobType: JobType;     // 'scan' | 'hack' | 'track'
  @gameField('string') targetId: string;     // Target SpaceObject ID
  @gameField('string') status: JobStatus;    // 'queued' | 'in_progress' | 'success' | 'failed'
  @gameField('float32') progress: number;    // 0.0 to 1.0
  @gameField('float32') startTime: number;   // Timestamp when job started
  @gameField('float32') duration: number;    // Expected duration (ms)
  @gameField('string') hackTarget?: string;  // For Hack jobs: system name to hack
}

type JobType = 'scan' | 'hack' | 'track';
type JobStatus = 'queued' | 'in_progress' | 'success' | 'failed';

// SpaceObjectBase (for hacked systems)
class SystemState extends Schema {
  // Existing fields...

  @gameField('boolean') hacked = false;      // Is system hacked?
  @gameField('float32') hackedUntil = 0;     // Timestamp when hack expires
}
```

**Data Model:**

```typescript
interface QueueJobCommand {
  jobType: JobType;
  targetId: string;
  hackTarget?: string; // Only for 'hack' jobs
}

interface CancelJobCommand {
  jobId: string;
}

interface ActivateTrackCommand {
  targetId: string;
}

interface DeactivateTrackCommand {
  targetId: string;
}
```

**Sync:**

- **What:** `signalsJobs` ArraySchema, `trackedTargets` ArraySchema
- **Frequency:** On change (job queued, status updated, completed)
- **Authority:** Server-only (ShipState manages, clients observe)
- **Size:**
  - Per job: ~100 bytes (id, type, target, status, progress, times)
  - 9 jobs × 100 bytes = 900 bytes per ship
  - Progress updates: 10 Hz (10 bytes/sec per active job)

**API:**

*Commands:*
```typescript
// Queue a new job
room.send('queueJob', {
  jobType: 'scan',
  targetId: 'ship-123'
});

// Queue a hack job (must specify system)
room.send('queueJob', {
  jobType: 'hack',
  targetId: 'ship-123',
  hackTarget: 'weapons' // System name: 'weapons', 'engines', 'shields', etc.
});

// Activate track (instant, not queued)
room.send('activateTrack', {
  targetId: 'ship-123'
});

// Deactivate track
room.send('deactivateTrack', {
  targetId: 'ship-123'
});

// Cancel job (remove from queue)
room.send('cancelJob', {
  jobId: 'job-abc-123'
});
```

*JSON Pointer:*
```typescript
// Read job queue
`/Ship/${shipId}/signalsJobs`

// Read tracked targets
`/Ship/${shipId}/trackedTargets`

// Check if system is hacked
`/Ship/${shipId}/systems/${systemName}/hacked`
```

*Methods:*
```typescript
class ShipState {
  // Queue a new job (validates queue not full, target exists, requirements met)
  queueJob(jobType: JobType, targetId: string, hackTarget?: string): SignalsJob | null

  // Cancel job by ID (removes from queue, stops if active)
  cancelJob(jobId: string): void

  // Activate track on target (instant, adds to trackedTargets)
  activateTrack(targetId: string): boolean

  // Deactivate track on target (removes from trackedTargets)
  deactivateTrack(targetId: string): void

  // Internal: Process job queue (called on tick)
  processJobQueue(deltaTime: number): void

  // Internal: Execute next queued job
  executeNextJob(): void

  // Internal: Complete active job (success or failure)
  completeJob(job: SignalsJob, success: boolean): void
}

class SpaceManager {
  // Validate job can execute (target in range, requirements met)
  canExecuteJob(ship: ShipState, job: SignalsJob): boolean

  // Apply hack effect to target system
  hackSystem(targetId: string, systemName: string, duration: number): void

  // Check if system is hacked
  isSystemHacked(shipId: string, systemName: string): boolean

  // Get system effectiveness (accounts for hack)
  getSystemEffectiveness(ship: ShipState, systemName: string): number
}
```

**Integration:**

*Modified Classes:*
- `ShipState` - Add `signalsJobs` queue, `trackedTargets` array, job processing logic
- `SystemState` - Add `hacked` flag, `hackedUntil` timestamp
- `SpaceManager` - Add job validation, hack effects, effectiveness calculation
- Radar widgets - Display tracked targets with badge, ignore LOS for tracked
- Engineering station - Show "COMPROMISED" warning for hacked systems

*New Classes:*
```typescript
class SignalsJob extends Schema {
  // Job data model (see State section)
}

class JobExecutor {
  // Handles job execution logic (duration, success rate, effects)
  static execute(ship: ShipState, job: SignalsJob, spaceManager: SpaceManager): void
}
```

*Dependencies:*
- #1205 (Scan Levels) - Scan job upgrades levels, Hack requires Lvl2
- Existing radar widgets - Tracked target display
- Existing system effectiveness formulas - Hack modifier integration

**Performance:**

*Complexity:*
- Job queue processing: O(1) per tick (only active job processed)
- Job validation: O(1) per job (range check, target lookup)
- Hack effect: O(1) per hacked system (timestamp check)
- Total jobs: O(ships) - max 9 per ship, but only 1 active per ship

*Optimizations:*
- Only sync job progress for active job (not queued jobs)
- Lazy hack expiration check (only on system usage, not every tick)
- Track limit (max 3) prevents spam

## 5. UX

**UI:**

*Job Queue Widget (Signals Station):*
```
┌─ SIGNALS JOBS ─────────────────┐
│ [In Progress]                   │
│ ▸ Scanning UCS Destroyer        │
│   ████████░░░░ 60% (12s left)   │
│                                 │
│ [Queued]                        │
│ 1. Hack UCS Destroyer (Weapons) │
│ 2. Scan Federation Cruiser      │
│ 3. Scan UNKNOWN-47              │
│                                 │
│ Queue: 3/9 jobs                 │
└─────────────────────────────────┘
```

*Target Info Widget (Signals Station):*
```
┌─ TARGET INFO ──────────────────┐
│ UCS Destroyer (Scan Lvl2)      │
│ Distance: 5234u | Heading: 045°│
│                                 │
│ [Scan] [Hack ▼] [Track]        │
│                                 │
│ Systems:                        │
│ • Weapons: 80% [HACK THIS]     │
│ • Engines: 100%                │
│ • Shields: 45%                 │
│ • Sensors: 70%                 │
└─────────────────────────────────┘
```

*Tracked Target Badge (Radar):*
- Target has "📍" icon overlay
- Tooltip: "TRACKED - visible through obstacles"
- Visible even behind planets/nebulae

*Hacked System Warning (Engineering Station):*
```
┌─ WEAPONS SYSTEM ───────────────┐
│ ⚠️  SYSTEM COMPROMISED          │
│ Effectiveness: 50% (HACKED)    │
│ Restores in: 1:45              │
│                                 │
│ Power: 100%                    │
│ Coolant: 80%                   │
└─────────────────────────────────┘
```

**Interactions:**

*Queue Scan Job:*
1. Signals officer clicks target on long-range radar
2. Target info shows "Scan Lvl0" or "Scan Lvl1"
3. Clicks "Scan" button
4. Job added to queue: "Scanning UNKNOWN-47 (Lvl0→Lvl1)"
5. If queue empty, job starts immediately
6. Progress bar animates

*Queue Hack Job:*
1. Signals officer selects Lvl2 target
2. Target info shows systems list
3. Clicks "Hack ▼" dropdown
4. Selects system to hack: "Weapons"
5. Job added to queue: "Hacking UCS Destroyer (Weapons)"
6. Job executes when queue reaches it
7. On success: Target's weapons drop to 50% for 2-3 min

*Activate Track:*
1. Signals officer selects Lvl1+ target
2. Clicks "Track" button (toggle)
3. Target immediately shows 📍 badge on radar
4. Target visible through planets/nebulae (LOS ignored)
5. Tracked targets list shows: "UCS Destroyer, Federation Cruiser, UNKNOWN-47 (3/3)"
6. Click "Track" again to deactivate

*Job Fails (Target Out of Range):*
1. Job in progress: "Scanning UCS Cruiser - 15s remaining"
2. Target moves out of radar range
3. Job fails immediately
4. Job removed from queue
5. No effect applied
6. (No notification - target info panel just stops updating)

**Feedback:**

*Visual:*
- Job queue widget updates in real-time (progress bars, status changes)
- Target info panel populates new data on successful scan
- Hacked systems show red "COMPROMISED" banner
- Tracked targets show 📍 badge
- Active job has pulsing border

*Audio:*
- (Optional) Success beep when job completes
- (Optional) Failure buzz when job fails
- (Deferred to polish phase)

*Haptic:*
- None

**Flows:**

*Signals Officer Workflow (Scan → Hack):*
1. Detect unknown target on long-range radar
2. Queue scan job (Lvl0→Lvl1): 20s
3. Wait for completion
4. Target revealed as "UCS Destroyer"
5. Queue another scan (Lvl1→Lvl2): 40s
6. Wait for completion
7. Systems list now visible: Weapons 80%, Engines 100%, Shields 45%
8. Identify priority target: Weapons system
9. Queue hack job: "Hack UCS Destroyer (Weapons)": 45s
10. Wait for completion
11. On success: Enemy weapons drop to 40% effectiveness (80% × 50%)
12. Notify Weapons officer: "UCS Destroyer weapons compromised!"
13. Enemy struggles to return fire effectively for 2-3 minutes

*Multi-Target Scan Workflow:*
1. 5 unknown targets detected
2. Queue 5 scan jobs (queue shows 5/9)
3. Jobs execute sequentially, ~20s each
4. After 1:40, all targets scanned to Lvl1
5. Prioritize: 2 are friendly, 3 are enemies
6. Queue deep scans for 3 enemies (Lvl1→Lvl2)
7. After another 2 minutes, all enemies fully scanned
8. Full intel on all targets

*Track Workflow (Relay Coordination):*
1. Signals officer identifies high-priority enemy: "UCS Battleship"
2. Clicks "Track" to activate
3. Battleship now visible on all friendly radars, even behind planets
4. Relay officer monitors battleship position continuously
5. Pilot can navigate around obstacles while keeping enemy in sight
6. Weapons officer maintains firing solution despite LOS blocks
7. When battleship destroyed or out of range, track deactivates automatically

## 6. Testing

**Unit Tests:**

*Job Queue Management:*
```typescript
describe('ShipState.queueJob', () => {
  it('should queue job successfully', () => {
    const job = ship.queueJob('scan', 'target-123');
    expect(ship.signalsJobs.length).toBe(1);
    expect(job.jobType).toBe('scan');
    expect(job.targetId).toBe('target-123');
    expect(job.status).toBe('queued');
  });

  it('should reject job if queue full (9 jobs)', () => {
    for (let i = 0; i < 9; i++) {
      ship.queueJob('scan', `target-${i}`);
    }
    const job = ship.queueJob('scan', 'target-10');
    expect(job).toBeNull();
    expect(ship.signalsJobs.length).toBe(9);
  });

  it('should start first job immediately if queue empty', () => {
    const job = ship.queueJob('scan', 'target-123');
    expect(job.status).toBe('in_progress');
  });
});
```

*Job Execution:*
```typescript
describe('ShipState.processJobQueue', () => {
  it('should complete job and start next in queue', async () => {
    const job1 = ship.queueJob('scan', 'target-1');
    const job2 = ship.queueJob('scan', 'target-2');

    // Simulate job duration
    await advanceTime(20000); // 20 seconds

    expect(ship.signalsJobs.length).toBe(1); // Job1 removed
    expect(ship.signalsJobs[0].targetId).toBe('target-2'); // Job2 active
    expect(ship.signalsJobs[0].status).toBe('in_progress');
  });

  it('should fail job if target out of range', async () => {
    const target = createTestShip({ position: { x: 3000, y: 0 } });
    ship.queueJob('scan', target.id);

    // Move target out of range
    target.position.x = 20000;
    await advanceTime(100);

    expect(ship.signalsJobs.length).toBe(0); // Job removed
  });
});
```

*Malfunction Effects:*
```typescript
describe('Job duration with malfunction', () => {
  it('should double duration if signals system at 50% effectiveness', async () => {
    ship.systems.signals.effectiveness = 0.5;
    const job = ship.queueJob('scan', 'target-123');

    // Base duration: 20s, with 50% effectiveness: 40s
    expect(job.duration).toBeCloseTo(40000, -2);
  });

  it('should reduce success rate if signals system malfunctioning', async () => {
    ship.systems.signals.effectiveness = 0.5;

    let successes = 0;
    for (let i = 0; i < 100; i++) {
      const job = ship.queueJob('hack', 'target-123', 'weapons');
      await advanceTime(60000);
      if (spaceManager.isSystemHacked('target-123', 'weapons')) {
        successes++;
      }
    }

    // Base success 60%, with 50% effectiveness: 30%
    expect(successes).toBeCloseTo(30, 10); // ~30 ± 10
  });
});
```

*Hack Effects:*
```typescript
describe('Hack job effects', () => {
  it('should reduce target system effectiveness by 50% for 2-3 minutes', async () => {
    const target = createTestShip();
    target.systems.weapons.effectiveness = 1.0;

    ship.queueJob('hack', target.id, 'weapons');
    await advanceTime(60000); // Job completes

    expect(target.systems.weapons.hacked).toBe(true);
    expect(spaceManager.getSystemEffectiveness(target, 'weapons')).toBeCloseTo(0.5);

    // Wait for hack to expire
    await advanceTime(180000); // 3 minutes
    expect(target.systems.weapons.hacked).toBe(false);
    expect(spaceManager.getSystemEffectiveness(target, 'weapons')).toBeCloseTo(1.0);
  });

  it('should block hack on Lvl0/Lvl1 targets', () => {
    const target = createTestShip();
    spaceManager.setScanLevel(target.id, ship.faction, ScanLevel.BASIC);

    const job = ship.queueJob('hack', target.id, 'weapons');
    expect(job).toBeNull(); // Requires Lvl2
  });
});
```

**Integration Tests (ShipTestHarness):**

*Multi-Ship Coordination:*
```typescript
it('should allow multiple ships to hack different systems on same target', async () => {
  const { ship: ship1 } = await createTestShip({ faction: 'UCS' });
  const { ship: ship2 } = await createTestShip({ faction: 'UCS' });
  const { ship: enemy } = await createTestShip({ faction: 'Federation' });

  // Both ships scan enemy to Lvl2 (shared scan levels)
  await ship1.sendCommand('queueJob', { jobType: 'scan', targetId: enemy.id });
  await advanceTime(20000);
  await ship1.sendCommand('queueJob', { jobType: 'scan', targetId: enemy.id });
  await advanceTime(40000);

  // Ship1 hacks weapons, Ship2 hacks engines (simultaneously)
  ship1.sendCommand('queueJob', { jobType: 'hack', targetId: enemy.id, hackTarget: 'weapons' });
  ship2.sendCommand('queueJob', { jobType: 'hack', targetId: enemy.id, hackTarget: 'engines' });
  await advanceTime(60000);

  // Both systems hacked
  expect(spaceManager.isSystemHacked(enemy.id, 'weapons')).toBe(true);
  expect(spaceManager.isSystemHacked(enemy.id, 'engines')).toBe(true);
});
```

*Track Visibility:*
```typescript
it('should show tracked target through LOS obstacles', async () => {
  const { ship, room } = await createTestShip();
  const { ship: target } = await createTestShip();

  // Place planet between ship and target
  const planet = spaceManager.createPlanet({ position: { x: 5000, y: 0 } });

  // Without track: target hidden by planet
  expect(ship.canSeeTarget(target.id)).toBe(false);

  // Activate track
  room.send('activateTrack', { targetId: target.id });
  await advanceTime(100);

  // With track: target visible despite planet
  expect(ship.trackedTargets).toContain(target.id);
  expect(ship.canSeeTarget(target.id)).toBe(true); // Track ignores LOS
});
```

**E2E Tests (Playwright):**

*Signals Officer Job Queue Workflow:*
```typescript
test('signals officer can queue and execute multiple jobs', async ({ page }) => {
  await page.goto('http://localhost:3000/ship/test-ship-1/signals');

  // Queue 3 scan jobs
  await page.click('[data-target-id="enemy-1"]');
  await page.click('[data-action="scan"]');
  await page.click('[data-target-id="enemy-2"]');
  await page.click('[data-action="scan"]');
  await page.click('[data-target-id="enemy-3"]');
  await page.click('[data-action="scan"]');

  // Verify queue shows 3 jobs
  await expect(page.locator('[data-id="JobsList"]')).toContainText('Queue: 3/9 jobs');

  // First job should be in progress
  await expect(page.locator('[data-job-index="0"]')).toHaveAttribute('data-status', 'in_progress');
  await expect(page.locator('[data-job-index="1"]')).toHaveAttribute('data-status', 'queued');

  // Wait for first job to complete
  await page.waitForSelector('[data-job-index="0"][data-status="success"]', { timeout: 30000 });

  // Second job should now be active
  await expect(page.locator('[data-job-index="0"]')).toHaveAttribute('data-status', 'in_progress');
  await expect(page.locator('[data-id="JobsList"]')).toContainText('Queue: 2/9 jobs');
});
```

*Hack Workflow:*
```typescript
test('signals officer can hack enemy system', async ({ page }) => {
  await page.goto('http://localhost:3000/ship/test-ship-1/signals');

  // Scan target to Lvl2 first
  await page.click('[data-target-id="enemy-1"]');
  await page.click('[data-action="scan"]');
  await page.waitForSelector('[data-job-status="success"]', { timeout: 60000 });

  // Queue hack job on weapons system
  await page.click('[data-action="hack"]'); // Opens dropdown
  await page.click('[data-hack-target="weapons"]');

  // Verify job queued
  await expect(page.locator('[data-id="JobsList"]')).toContainText('Hacking enemy-1 (Weapons)');

  // Wait for completion
  await page.waitForSelector('[data-job-status="success"]', { timeout: 60000 });

  // Verify target system hacked (check on Engineering station)
  await page.goto('http://localhost:3000/ship/enemy-1/engineering');
  await expect(page.locator('[data-system="weapons"]')).toContainText('COMPROMISED');
  await expect(page.locator('[data-system="weapons"]')).toContainText('50%');
});
```

## 7. Implementation

**Phase 1: Data Model & State (3-4 hours)**
- Add `SignalsJob` schema class
- Add `signalsJobs` ArraySchema to `ShipState`
- Add `trackedTargets` ArraySchema to `ShipState`
- Add `hacked`, `hackedUntil` to `SystemState`
- Write unit tests for job queue operations (queue, cancel, complete)

**Phase 2: Job Execution Logic (4-5 hours)**
- Implement `processJobQueue()` (sequential execution)
- Implement `canExecuteJob()` validation (range, requirements)
- Implement job duration calculation (with malfunction modifier)
- Implement job success rate calculation (with malfunction modifier)
- Write unit tests for execution, success/failure, malfunction effects

**Phase 3: Job Type Effects (4-5 hours)**
- Implement Scan job effect (upgrade scan level via SpaceManager)
- Implement Hack job effect (set system hacked flag, duration)
- Implement Track job effect (add/remove from trackedTargets)
- Update system effectiveness calculation (account for hack)
- Write unit tests for each job type's effects

**Phase 4: Commands & API (2-3 hours)**
- Add `queueJob` command handler
- Add `cancelJob` command handler
- Add `activateTrack` / `deactivateTrack` command handlers
- Add validation (queue size, target exists, requirements met)
- Write integration tests for commands

**Phase 5: UI Integration (5-6 hours)**
- Create Job Queue Widget (Signals station)
- Update Target Info Widget (add Scan/Hack/Track buttons)
- Update Radar Widgets (show tracked badge, LOS override)
- Update Engineering Station (show hacked system warning)
- Add progress bars, status indicators
- E2E tests for UI workflows

**Phase 6: E2E & Polish (3-4 hours)**
- E2E test: Full Scan→Hack workflow
- E2E test: Multi-job queue processing
- E2E test: Track activation/deactivation
- E2E test: Job failure on range loss
- Performance test: 20 ships × 9 jobs = 180 total jobs
- Documentation updates

**Total Effort:** 21-27 hours (3-4 days)

## 8. Open Questions

**Critical:** ✅ All resolved

**Important:** ✅ All resolved

**Nice-to-Have:**

- **Job reordering/prioritization?** - *Product, low impact* - Currently FIFO queue only. Could add drag-to-reorder in future.
- **Audio feedback for job completion?** - *Sound design, low impact* - Defer to polish phase
- **Visual scan beam effect?** - *Art, low impact* - Defer to polish phase
- **Additional job types (Jam, Intercept)?** - *Design, medium impact* - Defer to post-LARP based on gameplay feedback
- **Job cost (energy/coolant)?** - *Balance, low impact* - Currently free. Could add resource cost for balance.

## 9. References

**Issues:** #1206 (Signals Jobs System)
**Similar:** XState state machines, Job queues, Async task processing
**Docs:**
- `docs/MS3/SCAN_LEVELS_DESIGN.md` (companion design)
- `docs/SUBSYSTEMS.md` (system effectiveness formulas)
- `docs/API_REFERENCE.md` (commands, JSON Pointer)

**Dependencies:**
- #1205 (Scan Levels) - Scan job effect, Hack requirement
- #1208 (Signals Station) - UI integration
- Existing system effectiveness formulas - Hack modifier integration

**Next Steps:**
1. ✅ Design complete - review with stakeholders
2. Await approval
3. Create implementation issues (can split into 6 phases if needed)
4. Estimate in GitHub
5. Add to Phase 2 backlog (depends on #1205, blocks #1208)
