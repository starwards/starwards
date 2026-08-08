import { AdminDriver, GameStatus } from '@starwards/core';
import { addButton, addSliderBlade, addTextBlade, createWidgetPane } from '../panel';
import { aggregate, readProp, readWriteNumberProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

/** Rate presets, in `AdminState.speed` units. */
const RATES = [
    { label: 'pause', rate: 0 },
    { label: 'slow', rate: 0.25 },
    { label: 'play', rate: 1 },
    { label: 'fast', rate: 3 },
];

function clock(seconds: number) {
    const whole = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The GM's transport for whatever the game is doing. Rate control is `AdminState.speed`, which
 * scales every subsystem's `deltaSeconds`, so the same widget drives a live game and a replay —
 * the stations' observation chip reflects a pause here without knowing this widget exists.
 * During a replay it grows a position readout and a scrub control; those hide in a live game,
 * where there is nothing to seek through.
 */
export function gameTransportWidget(adminDriver: AdminDriver): DashboardWidget {
    class GameTransportComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawGameTransport(container, adminDriver);
        }
    }
    return {
        name: 'transport',
        type: 'component',
        component: GameTransportComponent,
        defaultProps: {},
    };
}

export function drawGameTransport(container: WidgetContainer, adminDriver: AdminDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Transport');
    const speed = readWriteNumberProp(adminDriver, '/speed');
    const gameStatus = readProp<GameStatus>(adminDriver, '/gameStatus');
    const position = readProp<number>(adminDriver, '/replayPosition');
    const duration = readProp<number>(adminDriver, '/replayDuration');

    for (const { label, rate } of RATES) {
        addButton(pane, () => speed.setValue(rate), { label, title: label }, cleanup.add);
    }
    addSliderBlade(pane, speed, { label: 'rate' }, cleanup.add);

    const positionBlade = addTextBlade(
        pane,
        aggregate(
            [position, duration],
            () => `${clock(position.getValue() ?? 0)} / ${clock(duration.getValue() ?? 0)}`,
        ),
        { label: 'position' },
        cleanup.add,
    );
    // A fraction rather than seconds: a Tweakpane slider's range is fixed when it is created,
    // and the recording's length is only known once a replay is loaded.
    const scrubBlade = addSliderBlade(
        pane,
        {
            range: [0, 1] as [number, number],
            getValue: () => {
                const total = duration.getValue() ?? 0;
                return total > 0 ? (position.getValue() ?? 0) / total : 0;
            },
            onChange: aggregate([position, duration], () => position.getValue()).onChange,
            setValue: (fraction: number) =>
                adminDriver.sendJsonCmd('/replaySeekCommand', fraction * (duration.getValue() ?? 0)),
        },
        { label: 'scrub', min: 0, max: 1, step: 0.001 },
        cleanup.add,
    );

    const applyMode = () => {
        const replaying = gameStatus.getValue() === GameStatus.REPLAY;
        for (const blade of [positionBlade, scrubBlade]) {
            blade.element.style.display = replaying ? '' : 'none';
        }
    };
    cleanup.add(gameStatus.onChange(applyMode));
    applyMode();
}
