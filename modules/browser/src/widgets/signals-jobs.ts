import {
    Destructors,
    JobStatus,
    ShipDriver,
    SignalsJob,
    SpaceDriver,
    objectDisplayName,
    playerScanLevel,
} from '@starwards/core';
import { addBarBlade, addButton, addInputBlade, addTextBlade, createWidgetPane } from '../panel';
import { readNumberProp, readProp, readWriteProp, writeProp } from '../property-wrappers';

import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';

function jobLabel(spaceDriver: SpaceDriver, shipDriver: ShipDriver, job: SignalsJob) {
    // scan jobs target every kind of space object, not just ships
    const target = spaceDriver.state.get(job.targetId);
    const scanLevel = target && playerScanLevel(target, shipDriver.state.faction);
    const targetName = objectDisplayName(target, job.targetId, scanLevel);
    return `SCAN ${targetName}`;
}

/**
 * The signals station's view of its job queue: only the job the station is working on right now
 * is shown (dormant jobs stay hidden), with a pause-all toggle and a button that prioritizes the
 * radar-selected target's job to the top of the queue.
 */
export function drawSignalsJobs(
    container: WidgetContainer,
    shipDriver: ShipDriver,
    spaceDriver: SpaceDriver,
    stationTarget: SelectionContainer,
) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Signals Jobs');

    const jobs = () => shipDriver.state.signals.jobs;
    const activeJobIndex = () => jobs().findIndex((job) => job.status === JobStatus.IN_PROGRESS);

    addInputBlade<boolean>(
        pane,
        readWriteProp<boolean>(shipDriver, '/signals/jobsPaused'),
        { label: 'paused' },
        panelCleanup.add,
    );

    addButton(
        pane,
        () => {
            const selected = stationTarget.getSingle();
            const job = selected && jobs().find((j) => j.targetId === selected.id);
            if (job) {
                writeProp(shipDriver, '/signals/prioritizeJobId').setValue(job.id);
            }
        },
        { label: '', title: 'Prioritize Target' },
        panelCleanup.add,
    );

    // the blades below re-wire whenever the job at the working slot changes
    let session = new Destructors();
    panelCleanup.add(() => session.destroy());

    function render() {
        session.destroy();
        session = new Destructors();
        const index = activeJobIndex();
        if (index < 0) {
            return;
        }
        const job = jobs()[index];
        addTextBlade(
            pane,
            readProp<number>(shipDriver, `/signals/jobs/${index}/status`),
            { label: jobLabel(spaceDriver, shipDriver, job), format: (s: number) => JobStatus[s] },
            session.add,
        );
        addBarBlade(
            pane,
            readNumberProp(shipDriver, `/signals/jobs/${index}/progress`),
            { label: 'progress', format: (p: number) => `${Math.round(p * 100)}%` },
            session.add,
        );
        // this button is destroyed and rebuilt whenever the active job changes, so the captured
        // job is always the one on display
        addButton(
            pane,
            () => writeProp(shipDriver, '/signals/cancelJobId').setValue(job.id),
            { label: '', title: 'Cancel' },
            session.add,
        );
    }

    const signature = () => {
        const index = activeJobIndex();
        return index < 0 ? '' : `${index}:${jobs()[index].id}`;
    };
    let lastSignature = '';
    const onJobsChange = () => {
        const current = signature();
        if (current !== lastSignature) {
            lastSignature = current;
            render();
        }
    };
    // both subscriptions are needed: add/remove emits on the array's own pointer, while an
    // in-place status flip emits only on the item's field pointer (and '**' does not match
    // its own prefix)
    shipDriver.events.on('/signals/jobs', onJobsChange);
    shipDriver.events.on('/signals/jobs/**', onJobsChange);
    panelCleanup.add(() => {
        shipDriver.events.off('/signals/jobs', onJobsChange);
        shipDriver.events.off('/signals/jobs/**', onJobsChange);
    });
    onJobsChange();
}
