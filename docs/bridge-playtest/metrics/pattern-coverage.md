# Pattern & Anti-Pattern Checklists

Design review checklists derived from the EmptyEpsilon research dossier.
These are not scored metrics — they are reference lists for reviewing
whether a design has considered each structural pattern.

## Comms-Forcing Patterns (11)

| # | Pattern | Present if… |
|---|---------|------------|
| 1 | Information Lock | Data at A, action at B, no UI bridge |
| 2 | Asymmetric Readout | Same object, different fields per station |
| 3 | Consoleless Coordinator | A role with decision authority but no console |
| 4 | Scale Differential | Roles differ by information radius, not topic |
| 5 | Recurrent Numerical Handoff | A specific number must be spoken per trigger |
| 6 | Internal-View Role | A role that sees only inside the system, no external awareness |
| 7 | Cooperative Action Chain | A goal requires sequential actions from 3+ roles |
| 8 | Range-Limited Action by Proxy | An action requires another role's positioning |
| 9 | Forced Report Trigger | A mechanical event compels a role to announce |
| 10 | Per-Role Input Modality | Each role has physically distinct controls |
| 11 | Live Authority for Narrative | A facilitator with real-time scenario editing |

## Anti-Patterns (6)

| # | Anti-Pattern | Present if… |
|---|-------------|------------|
| 1 | Auto-Pushed Data | Successful action auto-updates other screens, removing verbal handoff |
| 2 | Solo Minigame | A task occupies a player in isolation with no cross-station input |
| 3 | Station Merging | Two interdependent roles combined into one, internalizing the dependency |
| 4 | Convention-Only Silos | Information asymmetry relies on player discipline, not enforcement |
| 5 | Tutorials Teaching in Isolation | Onboarding covers per-station controls, not inter-station dependencies |
| 6 | Flat Workload | All stations busy or idle simultaneously, no staggered demand |

## Comparison Template

Use this to review pattern and anti-pattern status across games.
Not scored — just ✅ / 🟡 / ❌ for each row.

### Patterns

| Pattern | EE (6-station) | EE (4-station) | SW (current) | SW (target) |
|---------|---------------|---------------|-------------|------------|
| 1. Information Lock | ✅ | ✅ | 🟡 | |
| 2. Asymmetric Readout | ✅ | ✅ | ✅ | |
| 3. Consoleless Coordinator | ✅ | ✅ | ✅ | |
| 4. Scale Differential | ✅ | ✅ | 🟡 | |
| 5. Recurrent Numerical Handoff | ✅ | ✅ | 🟡 | |
| 6. Internal-View Role | ✅ | ✅ | ✅ | |
| 7. Cooperative Action Chain | ✅ | ✅ | 🟡 | |
| 8. Range-Limited by Proxy | ✅ | ✅ | ❌ | |
| 9. Forced Report Trigger | 🟡 | 🟡 | ❌ | |
| 10. Per-Role Input Modality | ✅ | ✅ | ✅ | |
| 11. Live Authority | ✅ | ✅ | 🟡 | |

### Anti-Patterns

| Anti-Pattern | EE (6-station) | EE (4-station) | SW (current) | SW (target) |
|-------------|---------------|---------------|-------------|------------|
| 1. Auto-Pushed Data | ✅ present | ✅ present | minor | |
| 2. Solo Minigame | ✅ present | ✅ present | not built yet | |
| 3. Station Merging | absent | ✅ present | absent | |
| 4. Convention-Only Silos | ✅ present | ✅ present | minor | |
| 5. Isolation Tutorials | ✅ present | ✅ present | not built yet | |
| 6. Flat Workload | ✅ present | ✅ present | not testable yet | |
