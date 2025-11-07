# Warp Frequency Topology System Design

**Purpose:** Pre-engineering design specification for the warp frequency topology system
**Status:** Design Document
**Created:** 2025-11-07

---

## Executive Summary

The warp frequency topology system creates an infinite, procedurally-generated "terrain" of efficiency zones in space. Ships travel faster by following high-efficiency "veins" and selecting optimal frequencies, creating strategic navigation gameplay where route planning matters as much as raw speed.

---

## System Overview

### Core Concept

Space contains invisible efficiency patterns that affect warp drive performance. Different frequencies resonate with different patterns, requiring navigators to:
- Identify high-efficiency zones for their route
- Select appropriate frequencies for different regions
- Balance direct paths vs efficient corridors
- Manage frequency transitions

### Gameplay Impact

- **Navigation becomes strategic** - Not just point A to B
- **Crew cooperation required** - Navigator plots, Relay shares, Pilot executes
- **Exploration rewarded** - Discovering new efficient routes
- **Faction advantages** - Different factions may excel at different frequencies

---

## Design Principles

1. **Infinite & Seamless** - No boundaries or loading zones
2. **Deterministic** - Same location always has same topology
3. **Visually Intuitive** - Clear heat map visualization
4. **Performance Scalable** - Works with 20+ concurrent ships
5. **Gameplay Depth** - Multiple valid strategies for navigation

---

## Functional Requirements

### Navigator Station

**Primary Functions:**
- Visualize efficiency topology for selected frequency
- Switch between 10 frequency layers
- Plot optimal routes through high-efficiency zones
- Mark frequency change waypoints
- Save and name routes for reuse
- Share routes to Relay station

**User Experience:**
- Real-time heatmap overlay on radar
- Color gradient: Red (poor) → Yellow (medium) → Green (excellent)
- Frequency selector with hotkeys (1-0)
- Click-and-drag route plotting
- Route efficiency preview before committing

### Relay Station

**Primary Functions:**
- Receive routes from Navigator
- Store route library
- Forward routes to Pilot
- Manage waypoint collections
- Coordinate multi-ship routes

**User Experience:**
- Route list with names and efficiency ratings
- Quick share buttons
- Route preview on radar
- Waypoint management interface

### Pilot Station

**Primary Functions:**
- Receive routes from Relay
- Display current waypoint and next frequency
- Auto-pilot following waypoints
- Manual frequency switching
- Show current efficiency

**User Experience:**
- Next waypoint indicator on HUD
- Frequency change alerts
- Efficiency gauge showing current performance
- ETA based on route efficiency

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────┐
│            Warp Topology Manager            │
│  - Procedural pattern generation            │
│  - Efficiency calculations                  │
│  - Gradient computations                    │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼──────┐   ┌────────▼────────┐
│Route Optimizer│   │Frequency Manager │
│- Pathfinding  │   │- 10 frequencies  │
│- Waypoints    │   │- Characteristics │
└───────┬──────┘   └────────┬────────┘
        │                   │
        └─────────┬─────────┘
                  │
     ┌────────────┴────────────┐
     │                         │
┌────▼─────┐  ┌────────┐  ┌───▼───┐
│Navigator │  │ Relay  │  │ Pilot │
│ Station  │◄─┤Station │◄─┤Station│
└──────────┘  └────────┘  └───────┘
```

### Data Flow

1. **Topology Generation**: Procedural noise creates efficiency patterns
2. **Route Planning**: Navigator requests optimal path calculation
3. **Route Storage**: Routes saved with waypoint metadata
4. **Route Sharing**: Navigator → Relay → Pilot communication
5. **Execution**: Pilot follows waypoints with frequency changes

---

## Frequency Design

### Ten Unique Frequencies

Each frequency has distinct characteristics affecting gameplay:

| Frequency | Pattern Style | Use Case | Characteristics |
|-----------|--------------|----------|-----------------|
| **Alpha** | Broad zones | Long-range travel | Stable, predictable |
| **Beta** | Balanced | General purpose | Moderate efficiency |
| **Gamma** | Narrow veins | High-speed runs | Risk/reward |
| **Delta** | Sparse highways | Exploration | Rare but powerful |
| **Epsilon** | Dense network | Tactical maneuvers | Short-range |
| **Zeta** | Chaotic | Evasion | Unpredictable |
| **Eta** | Trade routes | Commerce | Connects key points |
| **Theta** | Strategic | Military | Defensive positions |
| **Iota** | Complex | Research | Hidden patterns |
| **Kappa** | Emergency | Rapid response | Direct corridors |

### Pattern Generation

**Approach:** Multi-octave noise functions
- Base pattern from simplex noise
- Layered detail through octaves
- Threshold effects for "vein" appearance
- Power curves for contrast adjustment

**Parameters per Frequency:**
- Scale (feature size)
- Octaves (detail layers)
- Persistence (octave contribution)
- Lacunarity (frequency scaling)
- Threshold (vein definition)
- Power (contrast)

---

## Route Optimization

### Algorithm Requirements

- **Gradient Following** - Navigate along efficiency gradients
- **Target Direction** - Balance efficiency with directness
- **Frequency Switching** - Identify optimal transition points
- **Path Simplification** - Reduce waypoints while preserving route quality

### Optimization Factors

1. **Distance** - Shorter paths preferred
2. **Efficiency** - Higher efficiency zones prioritized
3. **Frequency Changes** - Minimize transitions (5-second penalty each)
4. **Smoothness** - Avoid sharp turns

### Route Metadata

Each route stores:
- Waypoint positions
- Frequency at each waypoint
- Expected efficiency
- Total distance
- Estimated time
- Creator information
- Access permissions

---

## Visualization Design

### Navigator Heatmap

**Display Layers:**
1. Base radar view
2. Efficiency overlay (30% opacity)
3. Route path lines
4. Waypoint markers
5. Frequency change indicators

**Color Scheme:**
- Efficiency gradient: Red → Yellow → Green → Cyan
- Frequency markers: Unique color per frequency
- Route lines: High contrast green
- Change points: Yellow highlight

### Performance Considerations

- **Level of Detail** - Reduce resolution at high zoom
- **Caching** - Store calculated grids
- **GPU Acceleration** - Shader-based rendering
- **Delta Updates** - Only recalculate changed areas

---

## Integration Points

### With Existing Systems

**Ship Physics:**
- Current speed = base speed × warp efficiency
- Smooth efficiency transitions
- Frequency change requires engine adjustment

**Waypoint System:**
- Extend existing waypoint format
- Add frequency metadata
- Support route collections

**Communication System:**
- New message types for route sharing
- Permission system for route access
- Broadcast efficiency updates

### With New Features

**Scan Levels:**
- Higher scan levels reveal enemy routes
- Faction-specific frequency advantages

**Probe System:**
- Probes can scout efficiency patterns
- Remote efficiency sampling

**Repair System:**
- Engine damage affects frequency switching
- Malfunction reduces efficiency bonus

---

## User Interface Requirements

### Navigator Controls

- **Frequency Selector**: Number keys 1-0
- **Route Mode**: R to start plotting
- **Save Route**: S when complete
- **Share Route**: Enter to send to Relay
- **Clear Route**: Escape to cancel

### Visual Feedback

- **Efficiency Indicator**: Always visible gauge
- **Frequency Display**: Current frequency name/icon
- **Route Stats**: Distance, time, efficiency
- **Waypoint Counter**: Current/total waypoints

### Accessibility

- Color-blind friendly palettes
- Text labels for all frequencies
- Keyboard navigation support
- Adjustable overlay opacity

---

## Performance Requirements

### Scalability Targets

- **Ships**: 20+ concurrent with routes
- **View Range**: 10,000 unit radius
- **Grid Resolution**: 100x100 minimum
- **Update Rate**: 10 Hz for efficiency
- **Network**: < 5 KB/s per ship

### Optimization Strategies

- Procedural generation (no storage)
- Hierarchical sampling
- Client-side visualization
- Server validates routes only
- Compress route data

---

## Testing Requirements

### Functional Testing

- Efficiency calculations consistent
- Routes reach destinations
- Frequency changes apply correctly
- Route sharing works across stations
- Performance scales with ship count

### Gameplay Testing

- Routes provide meaningful advantage
- All frequencies have viable use cases
- Navigation skill progression
- Cooperative gameplay enhanced
- System intuitive to learn

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Performance at scale | Profile early, implement LOD |
| Visual clarity | User testing, adjustable settings |
| Network bandwidth | Compress data, client prediction |
| Gameplay balance | Tunable parameters, A/B testing |
| Learning curve | Tutorial, visual aids |

---

## Success Criteria

1. **Navigation Depth** - Routes 20-40% faster than direct paths
2. **Crew Cooperation** - Measurable advantage from coordination
3. **Visual Clarity** - Players understand topology at a glance
4. **Performance** - 60 FPS with 20 ships active
5. **Player Satisfaction** - Positive feedback on navigation gameplay

---

## Open Questions

1. Should faction bonuses apply to specific frequencies?
2. Can enemies see your active routes?
3. Should routes decay over time?
4. Can routes be disrupted/jammed?
5. Should there be route discovery rewards?

---

## Next Steps

1. **Prototype** - Proof of concept for pattern generation
2. **Visual Testing** - Validate heatmap clarity
3. **Performance Benchmark** - Stress test with target ship count
4. **Gameplay Iteration** - Tune parameters based on playtesting
5. **Integration** - Connect to existing station systems

---

**Related Documents:**
- MILESTONE_1_DESIGN_ANSWERS.md
- MILESTONE_1_PLAN.md
- docs/ARCHITECTURE.md