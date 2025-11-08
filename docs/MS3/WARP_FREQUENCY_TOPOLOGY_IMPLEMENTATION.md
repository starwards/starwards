# Warp Frequency Topology Implementation

**Purpose:** Complete implementation guide for procedural warp frequency topology system
**Status:** Technical Specification
**Created:** 2025-11-07

---

## Overview

The warp frequency topology system creates infinite, procedural patterns representing efficiency "veins" in space. Each frequency has unique characteristics, and navigators plot optimal routes through high-efficiency zones while managing frequency changes.

**Core Concept:** Space has varying warp efficiency based on location and frequency. Ships travel faster along high-efficiency "veins" by selecting the right frequency and following optimal paths.

---

## System Architecture

### 1. Core Topology Generator

```typescript
// modules/core/src/topology/WarpTopology.ts
import SimplexNoise from 'simplex-noise';
import { Vec2, makeId } from '@starwards/core';

export interface FrequencyPattern {
  id: string;
  name: string;
  color: string;
  description: string;
  // Noise parameters
  seed: number;
  scale: number;      // Size of features (smaller = tighter veins)
  octaves: number;     // Layers of detail
  persistence: number; // How much each octave contributes
  lacunarity: number;  // Frequency multiplier between octaves
  threshold: number;   // Creates "vein" effect
  power: number;       // Contrast adjustment
}

export interface WarpRoute {
  id: string;
  name: string;
  waypoints: WarpWaypoint[];
  totalDistance: number;
  estimatedTime: number;
  createdBy: string; // Navigator who created route
  sharedWith: string[]; // Ships that have access
}

export interface WarpWaypoint {
  position: Vec2;
  frequency: string;
  efficiency: number;
  isFrequencyChange?: boolean;
}

export class WarpTopologyManager {
  private frequencies: Map<string, FrequencyPattern>;
  private noiseGenerators: Map<string, SimplexNoise>;
  private savedRoutes: Map<string, WarpRoute> = new Map();

  constructor() {
    this.frequencies = new Map();
    this.noiseGenerators = new Map();
    this.initializeFrequencies();
  }

  private initializeFrequencies() {
    const patterns: FrequencyPattern[] = [
      {
        id: 'alpha',
        name: 'Alpha - Long Range',
        description: 'Broad efficiency zones for stable long-distance travel',
        color: '#FF0000',
        seed: 12345,
        scale: 0.001,
        octaves: 3,
        persistence: 0.6,
        lacunarity: 2.0,
        threshold: 0.0,
        power: 1.2
      },
      {
        id: 'beta',
        name: 'Beta - Balanced',
        description: 'Medium-sized veins with good overall efficiency',
        color: '#00FF00',
        seed: 23456,
        scale: 0.002,
        octaves: 4,
        persistence: 0.5,
        lacunarity: 2.2,
        threshold: 0.1,
        power: 1.5
      },
      {
        id: 'gamma',
        name: 'Gamma - High Speed',
        description: 'Narrow corridors with extreme efficiency',
        color: '#0000FF',
        seed: 34567,
        scale: 0.003,
        octaves: 5,
        persistence: 0.4,
        lacunarity: 1.8,
        threshold: 0.2,
        power: 2.0
      },
      {
        id: 'delta',
        name: 'Delta - Exploration',
        description: 'Sparse but powerful highways',
        color: '#FFFF00',
        seed: 45678,
        scale: 0.0008,
        octaves: 2,
        persistence: 0.7,
        lacunarity: 3.0,
        threshold: 0.3,
        power: 1.8
      },
      {
        id: 'epsilon',
        name: 'Epsilon - Tactical',
        description: 'Dense network for short-range maneuvering',
        color: '#FF00FF',
        seed: 56789,
        scale: 0.004,
        octaves: 6,
        persistence: 0.3,
        lacunarity: 2.5,
        threshold: -0.1,
        power: 1.3
      },
      // Additional 5 frequencies
      {
        id: 'zeta',
        name: 'Zeta - Stealth',
        description: 'Unpredictable patterns for evasive routes',
        color: '#00FFFF',
        seed: 67890,
        scale: 0.0025,
        octaves: 4,
        persistence: 0.45,
        lacunarity: 2.8,
        threshold: 0.15,
        power: 1.6
      },
      {
        id: 'eta',
        name: 'Eta - Commerce',
        description: 'Stable trade routes between sectors',
        color: '#FF8800',
        seed: 78901,
        scale: 0.0012,
        octaves: 3,
        persistence: 0.65,
        lacunarity: 2.1,
        threshold: 0.05,
        power: 1.1
      },
      {
        id: 'theta',
        name: 'Theta - Military',
        description: 'Strategic corridors for fleet movements',
        color: '#8800FF',
        seed: 89012,
        scale: 0.0018,
        octaves: 4,
        persistence: 0.55,
        lacunarity: 2.3,
        threshold: 0.25,
        power: 1.7
      },
      {
        id: 'iota',
        name: 'Iota - Scientific',
        description: 'Complex patterns for research missions',
        color: '#00FF88',
        seed: 90123,
        scale: 0.0035,
        octaves: 7,
        persistence: 0.35,
        lacunarity: 1.9,
        threshold: 0.0,
        power: 1.4
      },
      {
        id: 'kappa',
        name: 'Kappa - Emergency',
        description: 'Rapid response channels',
        color: '#FF0088',
        seed: 12340,
        scale: 0.0015,
        octaves: 3,
        persistence: 0.75,
        lacunarity: 2.6,
        threshold: 0.35,
        power: 2.2
      }
    ];

    patterns.forEach(pattern => {
      this.frequencies.set(pattern.id, pattern);
      this.noiseGenerators.set(pattern.id, new SimplexNoise(pattern.seed));
    });
  }

  /**
   * Get warp efficiency at any position for a frequency
   * Returns value between 0.1 (10% speed) and 2.0 (200% speed)
   */
  getEfficiency(position: Vec2, frequencyId: string): number {
    const pattern = this.frequencies.get(frequencyId);
    const noise = this.noiseGenerators.get(frequencyId);

    if (!pattern || !noise) return 0.5;

    // Multi-octave noise
    let value = 0;
    let amplitude = 1;
    let frequency = pattern.scale;
    let maxValue = 0;

    for (let i = 0; i < pattern.octaves; i++) {
      value += noise.noise2D(
        position.x * frequency,
        position.y * frequency
      ) * amplitude;

      maxValue += amplitude;
      amplitude *= pattern.persistence;
      frequency *= pattern.lacunarity;
    }

    // Normalize
    value = value / maxValue;

    // Apply threshold for vein effect
    if (pattern.threshold !== 0) {
      value = this.applyThreshold(value, pattern.threshold);
    }

    // Apply power for contrast
    const sign = Math.sign(value);
    value = sign * Math.pow(Math.abs(value), pattern.power);

    // Map to efficiency range [0.1, 2.0]
    return 0.1 + (value + 1) * 0.95;
  }

  private applyThreshold(value: number, threshold: number): number {
    if (value > threshold) {
      return (value - threshold) / (1 - threshold);
    } else {
      return (value - threshold) / (1 + threshold) - 1;
    }
  }

  /**
   * Get efficiency for all frequencies at a position
   * Used by Navigator to choose best frequency
   */
  getAllEfficiencies(position: Vec2): Map<string, number> {
    const efficiencies = new Map<string, number>();

    for (const [id] of this.frequencies) {
      efficiencies.set(id, this.getEfficiency(position, id));
    }

    return efficiencies;
  }

  /**
   * Get gradient for route optimization
   */
  getGradient(position: Vec2, frequencyId: string): Vec2 {
    const epsilon = 10.0;
    const current = this.getEfficiency(position, frequencyId);

    const dx = this.getEfficiency(
      { x: position.x + epsilon, y: position.y },
      frequencyId
    ) - current;

    const dy = this.getEfficiency(
      { x: position.x, y: position.y + epsilon },
      frequencyId
    ) - current;

    return { x: dx / epsilon, y: dy / epsilon };
  }

  /**
   * Get efficiency grid for visualization
   */
  getEfficiencyGrid(
    center: Vec2,
    radius: number,
    resolution: number,
    frequencyId: string
  ): number[][] {
    const grid: number[][] = [];
    const step = (radius * 2) / resolution;

    for (let y = 0; y < resolution; y++) {
      grid[y] = [];
      for (let x = 0; x < resolution; x++) {
        const worldPos = {
          x: center.x - radius + x * step,
          y: center.y - radius + y * step
        };
        grid[y][x] = this.getEfficiency(worldPos, frequencyId);
      }
    }

    return grid;
  }
}
```

---

### 2. Route Optimization

```typescript
// modules/core/src/navigation/RouteOptimizer.ts
export class WarpRouteOptimizer {
  constructor(private topology: WarpTopologyManager) {}

  /**
   * Find optimal route using flow field navigation
   */
  findOptimalRoute(
    start: Vec2,
    end: Vec2,
    preferredFrequency?: string
  ): WarpRoute {
    const waypoints: WarpWaypoint[] = [];
    const stepSize = 50;
    const maxSteps = 1000;

    let current = { ...start };
    let currentFreq = preferredFrequency || this.findBestFrequency(current);
    let lastFreq = currentFreq;

    waypoints.push({
      position: { ...current },
      frequency: currentFreq,
      efficiency: this.topology.getEfficiency(current, currentFreq)
    });

    for (let step = 0; step < maxSteps; step++) {
      // Check for better frequency every N steps
      if (step % 20 === 0) {
        const bestFreq = this.findBestFrequency(current);
        if (bestFreq !== currentFreq && this.shouldChangeFrequency(current, currentFreq, bestFreq)) {
          currentFreq = bestFreq;
          waypoints.push({
            position: { ...current },
            frequency: currentFreq,
            efficiency: this.topology.getEfficiency(current, currentFreq),
            isFrequencyChange: true
          });
        }
      }

      // Navigate using gradient ascent + target direction
      const toTarget = Vec2.Normalize(Vec2.Subtract(end, current));
      const gradient = this.topology.getGradient(current, currentFreq);

      // Weighted blend: follow efficiency gradient while moving toward target
      const blendFactor = 0.6; // 60% gradient, 40% direct
      const direction = {
        x: gradient.x * blendFactor + toTarget.x * (1 - blendFactor),
        y: gradient.y * blendFactor + toTarget.y * (1 - blendFactor)
      };

      // Step forward
      current.x += direction.x * stepSize;
      current.y += direction.y * stepSize;

      // Check arrival
      if (Vec2.Distance(current, end) < stepSize * 2) {
        waypoints.push({
          position: end,
          frequency: currentFreq,
          efficiency: this.topology.getEfficiency(end, currentFreq)
        });
        break;
      }

      // Add waypoint periodically or on frequency change
      if (step % 10 === 0 || currentFreq !== lastFreq) {
        waypoints.push({
          position: { ...current },
          frequency: currentFreq,
          efficiency: this.topology.getEfficiency(current, currentFreq)
        });
        lastFreq = currentFreq;
      }
    }

    // Simplify route
    const simplified = this.simplifyWaypoints(waypoints);

    return {
      id: makeId(),
      name: `Route to ${Math.round(end.x)},${Math.round(end.y)}`,
      waypoints: simplified,
      totalDistance: this.calculateDistance(simplified),
      estimatedTime: this.calculateTime(simplified),
      createdBy: '', // Set by caller
      sharedWith: []
    };
  }

  private findBestFrequency(position: Vec2): string {
    const efficiencies = this.topology.getAllEfficiencies(position);
    let best = { id: 'alpha', efficiency: 0 };

    efficiencies.forEach((eff, id) => {
      if (eff > best.efficiency) {
        best = { id, efficiency: eff };
      }
    });

    return best.id;
  }

  private shouldChangeFrequency(
    position: Vec2,
    current: string,
    candidate: string
  ): boolean {
    const currentEff = this.topology.getEfficiency(position, current);
    const candidateEff = this.topology.getEfficiency(position, candidate);

    // Change if candidate is significantly better (20% threshold)
    return candidateEff > currentEff * 1.2;
  }

  private simplifyWaypoints(waypoints: WarpWaypoint[]): WarpWaypoint[] {
    if (waypoints.length <= 2) return waypoints;

    const simplified: WarpWaypoint[] = [waypoints[0]];
    const tolerance = 100;

    for (let i = 1; i < waypoints.length - 1; i++) {
      const wp = waypoints[i];

      // Always keep frequency changes
      if (wp.isFrequencyChange) {
        simplified.push(wp);
        continue;
      }

      // Keep if deviates from straight line
      const prev = simplified[simplified.length - 1];
      const next = waypoints[i + 1];

      if (this.pointToLineDistance(wp.position, prev.position, next.position) > tolerance) {
        simplified.push(wp);
      }
    }

    simplified.push(waypoints[waypoints.length - 1]);
    return simplified;
  }

  private pointToLineDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;

    return Math.sqrt(dx * dx + dy * dy);
  }

  private calculateDistance(waypoints: WarpWaypoint[]): number {
    let distance = 0;
    for (let i = 1; i < waypoints.length; i++) {
      distance += Vec2.Distance(waypoints[i - 1].position, waypoints[i].position);
    }
    return distance;
  }

  private calculateTime(waypoints: WarpWaypoint[]): number {
    let time = 0;
    const baseSpeed = 100; // Units per second at efficiency 1.0

    for (let i = 1; i < waypoints.length; i++) {
      const dist = Vec2.Distance(waypoints[i - 1].position, waypoints[i].position);
      const avgEfficiency = (waypoints[i - 1].efficiency + waypoints[i].efficiency) / 2;
      time += dist / (baseSpeed * avgEfficiency);

      // Add frequency change penalty
      if (waypoints[i].isFrequencyChange) {
        time += 5; // 5 second penalty
      }
    }

    return time;
  }
}
```

---

### 3. Server Integration

```typescript
// modules/server/src/rooms/SpaceRoom.ts
import { Room, Client } from 'colyseus';
import { SpaceState } from '@starwards/core';
import { WarpTopologyManager, WarpRouteOptimizer } from '../topology';

export class SpaceRoom extends Room<SpaceState> {
  private topology: WarpTopologyManager;
  private routeOptimizer: WarpRouteOptimizer;

  onCreate(options: any) {
    this.setState(new SpaceState());

    // Initialize topology system
    this.topology = new WarpTopologyManager();
    this.routeOptimizer = new WarpRouteOptimizer(this.topology);

    this.registerCommands();
  }

  private registerCommands() {
    // Get current warp efficiency
    this.onMessage('getWarpEfficiency', (client, data) => {
      const ship = this.state.ships.get(client.sessionId);
      if (!ship) return;

      const efficiency = this.topology.getEfficiency(
        ship.position,
        data.frequencyId || ship.warpFrequency
      );

      client.send('warpEfficiency', {
        frequency: data.frequencyId,
        efficiency,
        position: ship.position
      });
    });

    // Get efficiency grid for navigator
    this.onMessage('getEfficiencyGrid', (client, data) => {
      const grid = this.topology.getEfficiencyGrid(
        data.center,
        data.radius,
        data.resolution,
        data.frequencyId
      );

      client.send('efficiencyGrid', {
        grid,
        frequencyId: data.frequencyId,
        center: data.center,
        radius: data.radius
      });
    });

    // Calculate optimal route
    this.onMessage('calculateRoute', (client, data) => {
      const ship = this.state.ships.get(client.sessionId);
      if (!ship) return;

      const route = this.routeOptimizer.findOptimalRoute(
        data.start || ship.position,
        data.destination,
        data.preferredFrequency
      );

      route.createdBy = ship.id;

      // Save route
      this.topology.savedRoutes.set(route.id, route);

      client.send('routeCalculated', route);
    });

    // Share route with other ship
    this.onMessage('shareRoute', (client, data) => {
      const route = this.topology.savedRoutes.get(data.routeId);
      if (!route) return;

      route.sharedWith.push(data.targetShipId);

      // Notify target ship
      const targetClient = this.clients.find(c =>
        this.state.ships.get(c.sessionId)?.id === data.targetShipId
      );

      if (targetClient) {
        targetClient.send('routeShared', route);
      }
    });

    // Change warp frequency
    this.onMessage('setWarpFrequency', (client, data) => {
      const ship = this.state.ships.get(client.sessionId);
      if (!ship) return;

      ship.warpFrequency = data.frequencyId;
      ship.warpEfficiency = this.topology.getEfficiency(
        ship.position,
        data.frequencyId
      );
    });
  }

  // Update ship efficiency as it moves
  onUpdate(deltaTime: number) {
    this.state.ships.forEach(ship => {
      if (ship.velocity.x !== 0 || ship.velocity.y !== 0) {
        // Update efficiency based on current position and frequency
        ship.warpEfficiency = this.topology.getEfficiency(
          ship.position,
          ship.warpFrequency || 'alpha'
        );

        // Apply efficiency to actual speed
        const targetSpeed = ship.targetSpeed * ship.warpEfficiency;
        ship.currentSpeed = this.lerp(ship.currentSpeed, targetSpeed, 0.1);
      }
    });
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}
```

---

### 4. Navigator Station UI

```typescript
// modules/browser/src/stations/NavigatorStation.tsx
import * as PIXI from 'pixi.js';
import { WarpTopologyManager } from '@starwards/core';

export class NavigatorStation extends PIXI.Container {
  private topology: WarpTopologyManager;
  private efficiencyOverlay: PIXI.Graphics;
  private routeGraphics: PIXI.Graphics;
  private frequencySelector: FrequencySelector;
  private currentFrequency = 'alpha';
  private currentRoute: WarpRoute | null = null;
  private viewRadius = 2000;

  constructor(private room: Room) {
    super();
    this.topology = new WarpTopologyManager();
    this.setupUI();
  }

  private setupUI() {
    // Create radar background
    this.createRadarDisplay();

    // Add efficiency overlay
    this.efficiencyOverlay = new PIXI.Graphics();
    this.addChild(this.efficiencyOverlay);

    // Add route graphics
    this.routeGraphics = new PIXI.Graphics();
    this.addChild(this.routeGraphics);

    // Add frequency selector
    this.frequencySelector = new FrequencySelector();
    this.frequencySelector.on('change', (freq: string) => {
      this.currentFrequency = freq;
      this.updateEfficiencyDisplay();
    });
    this.addChild(this.frequencySelector);

    // Add route controls
    this.createRouteControls();

    // Initial update
    this.updateEfficiencyDisplay();
  }

  private async updateEfficiencyDisplay() {
    // Request grid from server
    this.room.send('getEfficiencyGrid', {
      center: this.ship.position,
      radius: this.viewRadius,
      resolution: 100,
      frequencyId: this.currentFrequency
    });

    // Server will respond with efficiencyGrid message
    this.room.onMessage('efficiencyGrid', (data) => {
      this.renderEfficiencyHeatmap(data.grid);
    });
  }

  private renderEfficiencyHeatmap(grid: number[][]) {
    this.efficiencyOverlay.clear();

    const cellSize = (this.viewRadius * 2) / grid.length;
    const scale = this.width / (this.viewRadius * 2);

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const efficiency = grid[y][x];
        const color = this.efficiencyToColor(efficiency);

        this.efficiencyOverlay.beginFill(color, 0.3);
        this.efficiencyOverlay.drawRect(
          (x * cellSize - this.viewRadius) * scale,
          (y * cellSize - this.viewRadius) * scale,
          cellSize * scale,
          cellSize * scale
        );
      }
    }
  }

  private efficiencyToColor(efficiency: number): number {
    // Map efficiency (0.1-2.0) to color
    const normalized = (efficiency - 0.1) / 1.9;

    if (normalized < 0.33) {
      // Red to yellow (poor to medium)
      const t = normalized * 3;
      const r = 255;
      const g = Math.floor(t * 255);
      return (r << 16) | (g << 8);
    } else if (normalized < 0.66) {
      // Yellow to green (medium to good)
      const t = (normalized - 0.33) * 3;
      const r = Math.floor((1 - t) * 255);
      const g = 255;
      return (r << 16) | (g << 8);
    } else {
      // Green to cyan (good to excellent)
      const t = (normalized - 0.66) * 3;
      const g = 255;
      const b = Math.floor(t * 255);
      return (g << 8) | b;
    }
  }

  private createRouteControls() {
    // Plot route button
    const plotButton = new PIXI.Text('Plot Route', {
      fontSize: 14,
      fill: 0xFFFFFF
    });
    plotButton.interactive = true;
    plotButton.on('click', () => this.plotRoute());
    plotButton.position.set(10, 10);
    this.addChild(plotButton);

    // Save route button
    const saveButton = new PIXI.Text('Save Route', {
      fontSize: 14,
      fill: 0xFFFFFF
    });
    saveButton.interactive = true;
    saveButton.on('click', () => this.saveRoute());
    saveButton.position.set(10, 40);
    this.addChild(saveButton);

    // Share route button
    const shareButton = new PIXI.Text('Share to Relay', {
      fontSize: 14,
      fill: 0xFFFFFF
    });
    shareButton.interactive = true;
    shareButton.on('click', () => this.shareRoute());
    shareButton.position.set(10, 70);
    this.addChild(shareButton);
  }

  private plotRoute() {
    // Get destination from click or input
    const destination = this.getDestination();

    this.room.send('calculateRoute', {
      destination,
      preferredFrequency: this.currentFrequency
    });

    this.room.onMessage('routeCalculated', (route: WarpRoute) => {
      this.currentRoute = route;
      this.renderRoute(route);
    });
  }

  private renderRoute(route: WarpRoute) {
    this.routeGraphics.clear();

    // Draw route path
    this.routeGraphics.lineStyle(2, 0x00FF00, 0.8);

    const scale = this.width / (this.viewRadius * 2);

    for (let i = 0; i < route.waypoints.length; i++) {
      const wp = route.waypoints[i];
      const screenPos = this.worldToScreen(wp.position, scale);

      if (i === 0) {
        this.routeGraphics.moveTo(screenPos.x, screenPos.y);
      } else {
        this.routeGraphics.lineTo(screenPos.x, screenPos.y);
      }

      // Draw waypoint marker
      const freq = this.topology.getFrequency(wp.frequency);
      this.routeGraphics.beginFill(parseInt(freq.color.slice(1), 16));
      this.routeGraphics.drawCircle(screenPos.x, screenPos.y, 4);
      this.routeGraphics.endFill();

      // Mark frequency changes
      if (wp.isFrequencyChange) {
        this.routeGraphics.lineStyle(2, 0xFFFF00);
        this.routeGraphics.drawCircle(screenPos.x, screenPos.y, 8);
        this.routeGraphics.lineStyle(2, 0x00FF00, 0.8);
      }
    }

    // Show route info
    this.displayRouteInfo(route);
  }

  private displayRouteInfo(route: WarpRoute) {
    const info = new PIXI.Text(
      `Distance: ${Math.round(route.totalDistance)}\\n` +
      `Time: ${Math.round(route.estimatedTime)}s\\n` +
      `Waypoints: ${route.waypoints.length}\\n` +
      `Freq Changes: ${route.waypoints.filter(w => w.isFrequencyChange).length}`,
      { fontSize: 12, fill: 0xFFFFFF }
    );
    info.position.set(this.width - 150, 10);
    this.addChild(info);
  }

  private shareRoute() {
    if (!this.currentRoute) return;

    // Share to relay station
    this.room.send('shareRoute', {
      routeId: this.currentRoute.id,
      targetShipId: this.getRelayStationId()
    });
  }

  private worldToScreen(worldPos: Vec2, scale: number): Vec2 {
    return {
      x: (worldPos.x - this.ship.position.x + this.viewRadius) * scale,
      y: (worldPos.y - this.ship.position.y + this.viewRadius) * scale
    };
  }
}

// Frequency selector component
class FrequencySelector extends PIXI.Container {
  private buttons: Map<string, PIXI.Container> = new Map();
  private selectedFreq = 'alpha';

  constructor() {
    super();
    this.createButtons();
  }

  private createButtons() {
    const frequencies = [
      { id: 'alpha', key: '1', color: 0xFF0000 },
      { id: 'beta', key: '2', color: 0x00FF00 },
      { id: 'gamma', key: '3', color: 0x0000FF },
      { id: 'delta', key: '4', color: 0xFFFF00 },
      { id: 'epsilon', key: '5', color: 0xFF00FF },
      // ... more frequencies
    ];

    frequencies.forEach((freq, index) => {
      const button = this.createFrequencyButton(freq);
      button.position.x = index * 60;
      this.addChild(button);
      this.buttons.set(freq.id, button);
    });
  }

  private createFrequencyButton(freq: any): PIXI.Container {
    const container = new PIXI.Container();

    // Background
    const bg = new PIXI.Graphics();
    bg.beginFill(freq.color, 0.3);
    bg.drawRoundedRect(0, 0, 50, 30, 5);
    container.addChild(bg);

    // Label
    const label = new PIXI.Text(freq.key, {
      fontSize: 14,
      fill: 0xFFFFFF
    });
    label.anchor.set(0.5);
    label.position.set(25, 15);
    container.addChild(label);

    // Interaction
    container.interactive = true;
    container.buttonMode = true;
    container.on('click', () => this.selectFrequency(freq.id));

    return container;
  }

  private selectFrequency(id: string) {
    this.selectedFreq = id;
    this.updateButtonStates();
    this.emit('change', id);
  }

  private updateButtonStates() {
    this.buttons.forEach((button, id) => {
      const bg = button.getChildAt(0) as PIXI.Graphics;
      bg.alpha = id === this.selectedFreq ? 1.0 : 0.3;
    });
  }
}
```

---

### 5. Pilot Station Integration

```typescript
// modules/browser/src/stations/PilotStation.tsx
export class PilotStation extends PIXI.Container {
  private routeDisplay: RouteDisplay;
  private currentRoute: WarpRoute | null = null;
  private currentWaypointIndex = 0;

  constructor(private room: Room) {
    super();
    this.setupUI();
    this.listenForRoutes();
  }

  private listenForRoutes() {
    // Receive shared routes from relay
    this.room.onMessage('routeShared', (route: WarpRoute) => {
      this.loadRoute(route);
    });
  }

  private loadRoute(route: WarpRoute) {
    this.currentRoute = route;
    this.currentWaypointIndex = 0;
    this.routeDisplay.showRoute(route);
    this.updateAutopilot();
  }

  private updateAutopilot() {
    if (!this.currentRoute || this.currentWaypointIndex >= this.currentRoute.waypoints.length) {
      return;
    }

    const waypoint = this.currentRoute.waypoints[this.currentWaypointIndex];

    // Check if need to change frequency
    if (waypoint.frequency !== this.ship.warpFrequency) {
      this.room.send('setWarpFrequency', {
        frequencyId: waypoint.frequency
      });
      this.showFrequencyChangeAlert(waypoint.frequency);
    }

    // Check arrival at waypoint
    if (Vec2.Distance(this.ship.position, waypoint.position) < 50) {
      this.currentWaypointIndex++;
      this.updateAutopilot();
    }

    // Update navigation display
    this.updateNavigationDisplay(waypoint);
  }

  private updateNavigationDisplay(waypoint: WarpWaypoint) {
    // Show heading to waypoint
    const heading = this.calculateHeading(this.ship.position, waypoint.position);

    // Show distance
    const distance = Vec2.Distance(this.ship.position, waypoint.position);

    // Show ETA
    const eta = distance / (this.ship.speed * waypoint.efficiency);

    this.navigationDisplay.update({
      heading,
      distance,
      eta,
      waypoint: `${this.currentWaypointIndex + 1}/${this.currentRoute.waypoints.length}`,
      frequency: waypoint.frequency,
      efficiency: waypoint.efficiency
    });
  }

  private showFrequencyChangeAlert(newFreq: string) {
    const alert = new PIXI.Text(
      `FREQUENCY CHANGE: ${newFreq.toUpperCase()}`,
      { fontSize: 20, fill: 0xFFFF00 }
    );
    alert.anchor.set(0.5);
    alert.position.set(this.width / 2, 100);
    this.addChild(alert);

    // Fade out after 3 seconds
    setTimeout(() => {
      this.removeChild(alert);
    }, 3000);
  }
}
```

---

## Performance Optimization

### WebGL Shader for Real-time Visualization

```glsl
// Navigator station fragment shader
precision highp float;

uniform vec2 u_center;
uniform float u_zoom;
uniform float u_time;
uniform int u_frequency;

// Simplex noise function
vec3 permute(vec3 x) {
  return mod(((x*34.0)+1.0)*x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m * m ;
  m = m * m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p, float scale, int octaves) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = scale;

  for(int i = 0; i < 6; i++) {
    if(i >= octaves) break;
    value += snoise(p * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }

  return value;
}

void main() {
  vec2 worldPos = u_center + (gl_FragCoord.xy - 0.5) * u_zoom;

  // Different parameters per frequency
  float scale = 0.001 + float(u_frequency) * 0.0005;
  int octaves = 3 + u_frequency / 2;

  float noise = fbm(worldPos, scale, octaves);

  // Apply threshold for vein effect
  float threshold = 0.1 + float(u_frequency) * 0.05;
  if(noise > threshold) {
    noise = (noise - threshold) / (1.0 - threshold);
  } else {
    noise = 0.0;
  }

  // Map to efficiency
  float efficiency = 0.1 + (noise + 1.0) * 0.95;

  // Color mapping
  vec3 color;
  if(efficiency < 1.0) {
    float t = efficiency;
    color = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 0.0), t);
  } else {
    float t = efficiency - 1.0;
    color = mix(vec3(1.0, 1.0, 0.0), vec3(0.0, 1.0, 0.0), t);
  }

  // Add subtle animation
  float pulse = sin(u_time * 2.0 + noise * 10.0) * 0.05 + 0.95;
  color *= pulse;

  gl_FragColor = vec4(color, 0.4);
}
```

---

## Configuration

```json
// modules/server/config/warpTopology.json
{
  "settings": {
    "defaultFrequency": "alpha",
    "frequencyChangePenalty": 5.0,
    "baseWarpSpeed": 100,
    "gradientBlendFactor": 0.6,
    "routeSimplificationTolerance": 100,
    "efficiencyUpdateInterval": 100
  },
  "frequencies": [
    {
      "id": "alpha",
      "name": "Alpha - Long Range",
      "description": "Broad efficiency zones for stable long-distance travel",
      "unlocked": true,
      "factionBonus": {
        "gravitas": 1.1,
        "raiders": 0.9
      }
    }
    // ... more frequencies
  ]
}
```

---

## Testing

```typescript
// modules/core/test/warpTopology.spec.ts
describe('WarpTopology', () => {
  let topology: WarpTopologyManager;
  let optimizer: WarpRouteOptimizer;

  beforeEach(() => {
    topology = new WarpTopologyManager();
    optimizer = new WarpRouteOptimizer(topology);
  });

  it('should generate consistent efficiency values', () => {
    const pos = { x: 1000, y: 1000 };
    const eff1 = topology.getEfficiency(pos, 'alpha');
    const eff2 = topology.getEfficiency(pos, 'alpha');
    expect(eff1).toBe(eff2);
  });

  it('should create smooth gradients', () => {
    const pos1 = { x: 1000, y: 1000 };
    const pos2 = { x: 1001, y: 1000 };

    const eff1 = topology.getEfficiency(pos1, 'alpha');
    const eff2 = topology.getEfficiency(pos2, 'alpha');

    expect(Math.abs(eff1 - eff2)).toBeLessThan(0.01);
  });

  it('should find optimal routes', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 5000, y: 5000 };

    const route = optimizer.findOptimalRoute(start, end);

    expect(route.waypoints.length).toBeGreaterThan(2);
    expect(route.waypoints[0].position).toEqual(start);
    expect(route.waypoints[route.waypoints.length - 1].position).toEqual(end);
  });

  it('should handle extreme coordinates', () => {
    const farPos = { x: 1000000, y: -1000000 };
    const eff = topology.getEfficiency(farPos, 'gamma');

    expect(eff).toBeGreaterThanOrEqual(0.1);
    expect(eff).toBeLessThanOrEqual(2.0);
  });
});
```

---

## Implementation Checklist

- [ ] Core topology generator with simplex noise
- [ ] 10 unique frequency patterns
- [ ] Route optimization algorithm
- [ ] Server-side topology management
- [ ] Navigator station UI with heatmap
- [ ] Frequency selector component
- [ ] Route plotting and saving
- [ ] Route sharing Navigator → Relay → Pilot
- [ ] Pilot autopilot with frequency changes
- [ ] WebGL shader for performance
- [ ] Efficiency physics integration
- [ ] Performance profiling
- [ ] Unit and integration tests
- [ ] Documentation

---

## Next Steps

1. **Prototype**: Implement core noise generation and test patterns
2. **Visualize**: Create debug tool to view frequency patterns
3. **Tune**: Adjust parameters for desired gameplay feel
4. **Integrate**: Connect to existing station systems
5. **Optimize**: Profile and implement GPU acceleration
6. **Test**: Multi-ship stress testing with route sharing