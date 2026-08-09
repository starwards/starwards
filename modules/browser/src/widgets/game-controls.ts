import { AdminDriver, GameStatus, RecordingInfo, createLogger } from '@starwards/core';
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

/** Step-back offsets, in seconds. Rewinding to a moment by dragging a 0..1 slider is hopeless. */
const STEPS_BACK = [10, 30];

const { error: logError } = createLogger('widget:game-controls');

function clock(seconds: number) {
    const whole = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The GM's controls for whatever the game is doing: rate, replay transport and recording.
 * Rate control is `AdminState.speed`, which scales every subsystem's `deltaSeconds`, so the
 * same widget drives a live game and a replay — the stations' observation chip reflects a pause
 * here without knowing this widget exists. The replay transport (position, scrub, step-back,
 * restart) hides in a live game, where there is nothing to seek through, and the recording
 * controls hide during a replay, which cannot be recorded.
 */
export function gameControlsWidget(adminDriver: AdminDriver): DashboardWidget {
    class GameControlsComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawGameControls(container, adminDriver);
        }
    }
    return {
        name: 'game controls',
        type: 'component',
        component: GameControlsComponent,
        defaultProps: {},
    };
}

export function drawGameControls(container: WidgetContainer, adminDriver: AdminDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Game Controls');
    const speed = readWriteNumberProp(adminDriver, '/speed');
    const gameStatus = readProp<GameStatus>(adminDriver, '/gameStatus');
    const position = readProp<number>(adminDriver, '/replayPosition');
    const duration = readProp<number>(adminDriver, '/replayDuration');
    const ended = readProp<boolean>(adminDriver, '/replayEnded');
    const isRecording = readProp<boolean>(adminDriver, '/isRecordingGame');
    const recordingSeconds = readProp<number>(adminDriver, '/recordingSeconds');

    const seekTo = (seconds: number) => adminDriver.sendJsonCmd('/replaySeekCommand', Math.max(0, seconds));

    for (const { label, rate } of RATES) {
        addButton(pane, () => speed.setValue(rate), { label, title: label }, cleanup.add);
    }
    addSliderBlade(pane, speed, { label: 'rate' }, cleanup.add);

    const positionBlade = addTextBlade(
        pane,
        aggregate(
            [position, duration, ended],
            () =>
                `${clock(position.getValue() ?? 0)} / ${clock(duration.getValue() ?? 0)}${
                    ended.getValue() ? ' ENDED' : ''
                }`,
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
            setValue: (fraction: number) => seekTo(fraction * (duration.getValue() ?? 0)),
        },
        { label: 'scrub', min: 0, max: 1, step: 0.001 },
        cleanup.add,
    );
    const stepBackButtons = STEPS_BACK.map((step) =>
        addButton(
            pane,
            () => seekTo((position.getValue() ?? 0) - step),
            { label: `-${step}s`, title: `-${step}s` },
            cleanup.add,
        ),
    );
    const restartButton = addButton(
        pane,
        () => {
            seekTo(0);
            speed.setValue(1);
        },
        { label: 'restart', title: 'restart' },
        cleanup.add,
    );

    // the stop result arrives over HTTP rather than through synced state, so it needs its own
    // change notification to reach the blade
    let lastSaved: RecordingInfo | null = null;
    const savedListeners = new Set<() => unknown>();
    const setLastSaved = (saved: RecordingInfo | null) => {
        lastSaved = saved;
        for (const listener of savedListeners) listener();
    };

    const recordButton = addButton(
        pane,
        () => {
            if (isRecording.getValue()) {
                adminDriver.stopRecording().then(setLastSaved).catch(logError);
            } else {
                setLastSaved(null);
                adminDriver.startRecording().catch(logError);
            }
        },
        { label: 'recording', title: 'Record' },
        cleanup.add,
    );
    const recordingBlade = addTextBlade(
        pane,
        aggregate([isRecording, recordingSeconds], () =>
            isRecording.getValue() ? `REC ${clock(recordingSeconds.getValue() ?? 0)}` : 'idle',
        ),
        { label: 'capture' },
        cleanup.add,
    );
    const savedBlade = addTextBlade(
        pane,
        {
            onChange: (cb: () => unknown) => {
                savedListeners.add(cb);
                return () => savedListeners.delete(cb);
            },
            getValue: () =>
                lastSaved
                    ? `${lastSaved.name} — ${clock(lastSaved.durationSeconds)}, ${lastSaved.frameCount} frames`
                    : '—',
        },
        { label: 'last saved' },
        cleanup.add,
    );

    const applyMode = () => {
        const replaying = gameStatus.getValue() === GameStatus.REPLAY;
        for (const blade of [positionBlade, scrubBlade, restartButton, ...stepBackButtons]) {
            blade.element.style.display = replaying ? '' : 'none';
        }
        restartButton.disabled = !ended.getValue();
        for (const blade of [recordButton, recordingBlade, savedBlade]) {
            blade.element.style.display = replaying ? 'none' : '';
        }
        recordButton.title = isRecording.getValue() ? 'Stop Recording' : 'Record';
    };
    for (const prop of [gameStatus, isRecording, ended]) {
        cleanup.add(prop.onChange(applyMode));
    }
    applyMode();
}
