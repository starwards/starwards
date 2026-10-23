import { BlipTraces, DEFAULT_TRACE_FADE_MS, TraceCandidate } from './blip-traces';
import { Container, Graphics, UPDATE_PRIORITY } from 'pixi.js';
import { Faction, ScanLevel, SpaceDriver, SpaceObject, playerScanLevel } from '@starwards/core';

import { CameraView } from '../camera-view';
import { radar } from '../../colors';

/**
 * Draws a fading shadow where each contact was last scanned, coasting on its last known velocity.
 * Beyond fading out, the shadow's core shrinks while an uncertainty ring widens around it, so a
 * stale contact reads as a guess about where it is, not a reading. Every trace has the same shape,
 * so a trace discloses nothing the blip it replaces did not.
 */
export class BlipTraceLayer {
    private graphics = new Graphics();
    private traces: BlipTraces;

    constructor(
        private parent: CameraView,
        private spaceDriver: SpaceDriver,
        private blipSize: number,
        private isVisible: (o: SpaceObject) => boolean,
        private getColor: (o: SpaceObject) => number,
        private playerFaction?: Faction,
        fadeMs = DEFAULT_TRACE_FADE_MS,
    ) {
        this.traces = new BlipTraces(fadeMs);
        this.graphics.label = 'blip-traces';
        parent.ticker.add(this.update, null, UPDATE_PRIORITY.LOW);
    }

    set fadeMs(value: number) {
        this.traces.fadeMs = value;
    }

    private *candidates(): Iterable<TraceCandidate & { object: SpaceObject }> {
        for (const object of this.spaceDriver.state) {
            if (object.destroyed) continue;
            const identified = playerScanLevel(object, this.playerFaction) >= ScanLevel.BASIC;
            yield {
                object,
                id: object.id,
                position: object.position,
                velocity: object.velocity,
                color: identified ? this.getColor(object) : radar.unknownTint,
            };
        }
    }

    private update = () => {
        const now = this.parent.ticker.lastTime;
        this.traces.update(now, this.candidates(), (c) => this.isVisible(c.object));
        this.graphics.clear();
        const radius = this.blipSize / 4;
        let count = 0;
        for (const { position, fade, color } of this.traces.sample(now)) {
            const { x, y } = this.parent.worldToScreen(position);
            const remaining = 1 - fade;
            this.graphics.circle(x, y, radius * (0.4 + 0.6 * remaining)).fill({ color, alpha: 0.6 * remaining });
            this.graphics
                .circle(x, y, radius * (1 + 1.5 * fade))
                .stroke({ width: 1, color, alpha: 0.8 * remaining * remaining });
            count++;
        }
        this.parent.canvas.setAttribute('data-blip-traces', `${count}`);
    };

    get renderRoot(): Container {
        return this.graphics;
    }
}
