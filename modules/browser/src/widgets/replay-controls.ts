import { addButton, addSliderBlade, addTextBlade, createWidgetPane } from '../panel';
import { aggregate, readNumberProp, readWriteNumberProp } from '../property-wrappers';

import { AdminDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

function clock(seconds: number) {
    const whole = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The GM's transport for a running replay. Rate control is `AdminState.speed` — the same lever
 * that scales a live game — so pausing a replay and pausing a game are one control, and the
 * stations' observation chip reflects it without knowing this widget exists.
 */
export function replayControlsWidget(adminDriver: AdminDriver): DashboardWidget {
    class ReplayControlsComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawReplayControls(container, adminDriver);
        }
    }
    return {
        name: 'replay',
        type: 'component',
        component: ReplayControlsComponent,
        defaultProps: {},
    };
}

export function drawReplayControls(container: WidgetContainer, adminDriver: AdminDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Replay');
    const speed = readWriteNumberProp(adminDriver, '/speed');
    const position = readNumberProp(adminDriver, '/replayPosition');
    const duration = readNumberProp(adminDriver, '/replayDuration');

    addTextBlade(
        pane,
        aggregate(
            [position, duration],
            () => `${clock(position.getValue() ?? 0)} / ${clock(duration.getValue() ?? 0)}`,
        ),
        { label: 'position' },
        cleanup.add,
    );
    addSliderBlade(pane, speed, { label: 'rate' }, cleanup.add);
    addButton(pane, () => speed.setValue(0), { label: 'hold', title: 'Hold' }, cleanup.add);
    addButton(pane, () => speed.setValue(1), { label: 'resume', title: 'Resume' }, cleanup.add);
    addButton(pane, () => void adminDriver.stopGame(), { label: 'end', title: 'End Replay' }, cleanup.add);
}
