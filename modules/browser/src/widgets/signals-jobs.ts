import { Destructors, ShipDriver, SpaceDriver, objectDisplayName, playerScanLevel } from '@starwards/core';
import { JobView, findJobForTarget, visibleJobRows } from './signals-jobs-rows';
import {
    addAnnunciatorBlade,
    addBareBarBlade,
    addButton,
    addTextBlade,
    createWidgetPane,
    setAnnunciatorColumns,
} from '../panel';
import { propertyStub, readNumberProp, readWriteProp, writeProp } from '../property-wrappers';

import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';

function jobLabel(spaceDriver: SpaceDriver, shipDriver: ShipDriver, job: Pick<JobView, 'targetId'>) {
    // scan jobs target every kind of space object, not just ships
    const target = spaceDriver.state.get(job.targetId);
    const scanLevel = target && playerScanLevel(target, shipDriver.state.faction);
    const targetName = objectDisplayName(target, job.targetId, scanLevel);
    return `SCAN · ${targetName}`;
}

function staticTextModel(value: string) {
    return { getValue: () => value, onChange: () => () => undefined };
}

/** Prioritizes the job (if any) targeting `targetId` — shared by the Prioritize button and the
 * Signals screen's keyboard binding. */
export function prioritizeJobForTarget(shipDriver: ShipDriver, jobs: Iterable<JobView>, targetId: string | undefined) {
    const job = findJobForTarget(jobs, targetId);
    if (job) {
        writeProp(shipDriver, '/signals/prioritizeJobId').setValue(job.id);
    }
}

/** Cancels the job (if any) targeting `targetId` — the keyboard equivalent of a row's Cancel
 * button, aimed at the radar-selected target instead of a specific row. */
export function cancelJobForTarget(shipDriver: ShipDriver, jobs: Iterable<JobView>, targetId: string | undefined) {
    const job = findJobForTarget(jobs, targetId);
    if (job) {
        writeProp(shipDriver, '/signals/cancelJobId').setValue(job.id);
    }
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
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Jobs');

    const jobs = () => shipDriver.state.signals.jobs;

    addAnnunciatorBlade(
        pane,
        readWriteProp<boolean>(shipDriver, '/signals/jobsPaused'),
        { label: 'Paused' },
        panelCleanup.add,
    );
    // a prioritize request is a momentary command; what persists is the job it flags
    const priorityTarget = propertyStub(false);
    addAnnunciatorBlade(pane, priorityTarget, { label: 'Priority Tgt' }, panelCleanup.add);
    setAnnunciatorColumns(pane, 2);

    addButton(
        pane,
        () => prioritizeJobForTarget(shipDriver, jobs(), stationTarget.getSingle()?.id),
        { label: '', title: 'Prioritize Target' },
        panelCleanup.add,
    );

    // the blades below re-wire whenever the job at the working slot changes
    let session = new Destructors();
    panelCleanup.add(() => session.destroy());

    function addCancel(job: JobView) {
        addButton(
            pane,
            () => writeProp(shipDriver, '/signals/cancelJobId').setValue(job.id),
            { label: '', title: 'Cancel' },
            session.add,
        );
    }

    function addJobRow<T>(
        value: { getValue: () => T | undefined; onChange: (cb: () => unknown) => () => void },
        job: JobView,
        format: (v: T) => string,
        index: number,
    ) {
        const row = addTextBlade(pane, value, { label: jobLabel(spaceDriver, shipDriver, job), format }, session.add);
        row.element.classList.add('sw-job');
        addBareBarBlade(pane, readNumberProp(shipDriver, `/signals/jobs/${index}/progress`), session.add);
    }

    function render() {
        session.destroy();
        session = new Destructors();
        const { active, queued, moreCount, dormantCount } = visibleJobRows(jobs());

        if (active) {
            const { index, job } = active;
            addJobRow(
                readNumberProp(shipDriver, `/signals/jobs/${index}/progress`),
                job,
                (p: number) => `${Math.round(p * 100)}%`,
                index,
            );
            // this button (and every row's button below) is destroyed and rebuilt together with
            // its row whenever the job list changes, so the captured job is always the one on display
            addCancel(job);
        }

        for (const { index, job } of queued) {
            addJobRow(staticTextModel('QUEUED'), job, (label: string) => label, index);
            addCancel(job);
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
            .map((job) => `${job.id}:${job.status}:${job.prioritized}`)
            .join(',');
    let lastSignature = '';
    const onJobsChange = () => {
        const current = signature();
        if (current !== lastSignature) {
            lastSignature = current;
            priorityTarget.setValue(jobs().some((job) => job.prioritized));
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
