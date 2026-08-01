import { Container, Graphics, Text, TextStyle, UPDATE_PRIORITY } from 'pixi.js';
import { QUEUE_MARKERS_SHOWN, jobIndicators } from './signals-jobs-indicators';
import { ShipDriver, SpaceDriver } from '@starwards/core';

import { CameraView } from './camera-view';

const indicatorColor = 0xff6600; // secondary orange
const ringRadius = 22; // just outside a 32px blip
const markerRadius = 16;

/**
 * Radar overlay for the signals station: a circular progress ring around the object being
 * scanned (arc length = the fraction of the job still remaining) and numbered markers on the
 * next few queued job targets.
 */
export class SignalsJobsLayer {
    private readonly stage = new Container();
    private readonly graphics = new Graphics();
    private readonly orderLabels: Text[];

    constructor(parent: CameraView, spaceDriver: SpaceDriver, shipDriver: ShipDriver) {
        this.stage.addChild(this.graphics);
        this.orderLabels = Array.from({ length: QUEUE_MARKERS_SHOWN }, (_, i) => {
            const label = new Text(
                `${i + 1}`,
                new TextStyle({ fontFamily: 'Bebas', fontSize: 14, fill: indicatorColor }),
            );
            label.visible = false;
            this.stage.addChild(label);
            return label;
        });
        parent.ticker.add(
            () => {
                this.graphics.clear();
                for (const label of this.orderLabels) {
                    label.visible = false;
                }
                const { active, queued } = jobIndicators(shipDriver.state.signals.jobs);
                const activeTarget = active && spaceDriver.state.get(active.targetId);
                if (active && activeTarget && !activeTarget.destroyed) {
                    const pos = parent.worldToScreen(activeTarget.position);
                    this.graphics
                        .circle(pos.x, pos.y, ringRadius)
                        .stroke({ width: 1, color: indicatorColor, alpha: 0.3 });
                    const start = -Math.PI / 2;
                    const end = start + 2 * Math.PI * active.remainingFraction;
                    this.graphics
                        .moveTo(pos.x + ringRadius * Math.cos(start), pos.y + ringRadius * Math.sin(start))
                        .arc(pos.x, pos.y, ringRadius, start, end)
                        .stroke({ width: 3, color: indicatorColor });
                }
                for (const { targetId, order } of queued) {
                    const target = spaceDriver.state.get(targetId);
                    if (!target || target.destroyed) {
                        continue;
                    }
                    const pos = parent.worldToScreen(target.position);
                    this.graphics
                        .circle(pos.x, pos.y, markerRadius)
                        .stroke({ width: 1, color: indicatorColor, alpha: 0.6 });
                    const label = this.orderLabels[order - 1];
                    label.position.set(pos.x + markerRadius * 0.8, pos.y - markerRadius * 1.8);
                    label.visible = true;
                }
            },
            null,
            UPDATE_PRIORITY.LOW,
        );
    }

    get renderRoot(): Container {
        return this.stage;
    }
}
