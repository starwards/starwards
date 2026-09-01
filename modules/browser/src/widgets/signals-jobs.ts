import { Destructors, JobStatus, ShipDriver, SpaceDriver, objectDisplayName, playerScanLevel } from '@starwards/core';
import { JobView, visibleJobRows } from './signals-jobs-rows';
import { addBarBlade, addButton, addInputBlade, addTextBlade, createWidgetPane } from '../panel';
import { readNumberProp, readProp, readWriteProp, writeProp } from '../property-wrappers';

import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';

function jobLabel(spaceDriver: SpaceDriver, shipDriver: ShipDriver, job: Pick<JobView, 'targetId'>) {
    // scan jobs target every kind of space object, not just ships
    const target = spaceDriver.state.get(job.targetId);
    const scanLevel = target && playerScanLevel(target, shipDriver.state.faction);
    const targetName = objectDisplayName(target, job.targetId, scanLevel);
    return `SCAN ${targetName}`;
}

function staticTextModel(value: string) {
    return { getValue: () => value, onChange: () => () => undefined };
}

/**
 * The signals station's view of its job queue: the in-progress job first (with progress and a
 * cancel button), then every queued job as a row in queue order (dormant jobs are never listed,
 * only counted), plus a pause-all toggle and a button that prioritizes the radar-selected
 * target's job to the top of the queue.
 */
export function drawSignalsJobs(
    container: WidgetContainer,
    shipDriver: ShipDriver,
    spaceDriver: SpaceDriver,
    stationTarget: SelectionContainer,
) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Signals Jobs');

    const jobs = () => shipDriver.state.signals.jobs;

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
        const { active, queued, moreCount, dormantCount } = visibleJobRows(jobs());

        if (active) {
            const { index, job } = active;
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
            // this button (and every row's button below) is destroyed and rebuilt together with
            // its row whenever the job list changes, so the captured job is always the one on display
            addButton(
                pane,
                () => writeProp(shipDriver, '/signals/cancelJobId').setValue(job.id),
                { label: '', title: 'Cancel' },
                session.add,
            );
        }

        for (const { index, job, position } of queued) {
            addTextBlade(
                pane,
                readProp<number>(shipDriver, `/signals/jobs/${index}/status`),
                {
                    label: jobLabel(spaceDriver, shipDriver, job),
                    format: (s: number) => `${JobStatus[s]} #${position}`,
                },
                session.add,
            );
            addButton(
                pane,
                () => writeProp(shipDriver, '/signals/cancelJobId').setValue(job.id),
                { label: '', title: 'Cancel' },
                session.add,
            );
        }

        if (moreCount > 0) {
            addTextBlade(pane, staticTextModel(`+${moreCount} more`), { label: '' }, session.add);
        }
        if (dormantCount > 0) {
            addTextBlade(pane, staticTextModel(`dormant: ${dormantCount}`), { label: '' }, session.add);
        }
    }

    const signature = () =>
        jobs()
            .map((job) => `${job.id}:${job.status}`)
            .join(',');
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
