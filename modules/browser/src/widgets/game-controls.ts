import { AdminDriver, RecordingInfo, createLogger } from '@starwards/core';
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

const { error: logError } = createLogger('widget:game-controls');

function clock(seconds: number) {
    const whole = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The GM's controls for a live game: rate and recording. Rate control is `AdminState.speed`,
 * which scales every subsystem's `deltaSeconds`.
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
    const isRecording = readProp<boolean>(adminDriver, '/isRecordingGame');
    const recordingSeconds = readProp<number>(adminDriver, '/recordingSeconds');

    for (const { label, rate } of RATES) {
        addButton(pane, () => speed.setValue(rate), { label, title: label }, cleanup.add);
    }
    addSliderBlade(pane, speed, { label: 'rate' }, cleanup.add);

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
    addTextBlade(
        pane,
        aggregate([isRecording, recordingSeconds], () =>
            isRecording.getValue() ? `REC ${clock(recordingSeconds.getValue() ?? 0)}` : 'idle',
        ),
        { label: 'capture' },
        cleanup.add,
    );
    addTextBlade(
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

    const updateRecordTitle = () => {
        recordButton.title = isRecording.getValue() ? 'Stop Recording' : 'Record';
    };
    cleanup.add(isRecording.onChange(updateRecordTitle));
    updateRecordTitle();
}
