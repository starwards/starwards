import { Destructors, ScanLevel, ShipDriver, SpaceDriver, objectDisplayName, playerScanLevel } from '@starwards/core';
import { JobView, findJobForTarget, visibleJobRows } from './signals-jobs-rows';
import { PromotionWatch, jobsSignature, scanStepLabel } from './signals-scan-steps';
import {
    addAnnunciatorBlade,
    addBareBarBlade,
    addButton,
    addTextBlade,
    createWidgetPane,
    setAnnunciatorColumns,
} from '../panel';
import { propertyStub, readNumberProp, readWriteProp, writeProp } from '../property-wrappers';

import { EmitterLoop } from '../loop';
import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';

function targetLevel(spaceDriver: SpaceDriver, shipDriver: ShipDriver, targetId: string): ScanLevel | undefined {
    const target = spaceDriver.state.get(targetId);
    return target && playerScanLevel(target, shipDriver.state.faction);
}

function targetName(spaceDriver: SpaceDriver, shipDriver: ShipDriver, targetId: string) {
    // scan jobs target every kind of space object, not just ships
    const target = spaceDriver.state.get(targetId);
    return objectDisplayName(target, targetId, targetLevel(spaceDriver, shipDriver, targetId));
}

/** e.g. `SCAN →BASIC · Asteroid 12`: the step the job is working on, so 100% means a known level.
 * The step precedes the name so a long name, not the step, is what the label truncates. */
function jobLabel(spaceDriver: SpaceDriver, shipDriver: ShipDriver, job: Pick<JobView, 'targetId'>) {
    const level = targetLevel(spaceDriver, shipDriver, job.targetId) ?? ScanLevel.UFO;
    return `SCAN ${scanStepLabel(level)} · ${targetName(spaceDriver, shipDriver, job.targetId)}`;
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
 * cancel button), then every queued job as a row in queue order (a dormant job is listed only
 * when it is waiting on the scan beam, as BEAM; other dormant jobs are only counted), plus a pause-all toggle and a button that
 * prioritizes the radar-selected target's job to the top of the queue.
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

    // a finished job leaves the list (or goes dormant), so the promotion it earned is shown here
    const lastScan = propertyStub('—');
    addTextBlade(pane, lastScan, { label: 'Last scan' }, panelCleanup.add).element.classList.add('sw-mode');

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
        withProgress = true,
    ) {
        const row = addTextBlade(pane, value, { label: jobLabel(spaceDriver, shipDriver, job), format }, session.add);
        row.element.classList.add('sw-job');
        if (withProgress) {
            addBareBarBlade(pane, readNumberProp(shipDriver, `/signals/jobs/${index}/progress`), session.add);
        }
    }

    function render() {
        session.destroy();
        session = new Destructors();
        const { active, queued, needsBeam, moreCount, moreBeamCount, dormantCount } = visibleJobRows(jobs());

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

        for (const { index, job } of needsBeam) {
            // short enough for the value column; a dormant job has no progress to bar
            addJobRow(staticTextModel('BEAM'), job, (label: string) => label, index, false);
            addCancel(job);
        }
        if (moreBeamCount > 0) {
            addTextBlade(pane, staticTextModel(`+${moreBeamCount} need beam`), { label: '' }, session.add);
        }

        if (moreCount > 0) {
            addTextBlade(pane, staticTextModel(`+${moreCount} more`), { label: '' }, session.add);
        }
        if (dormantCount > 0) {
            addTextBlade(pane, staticTextModel(`dormant: ${dormantCount}`), { label: '' }, session.add);
        }
    }

    const signature = () => jobsSignature(jobs(), (id) => targetLevel(spaceDriver, shipDriver, id));
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
    // promotions are polled, not driven by job events: the target's level arrives on the space
    // room while the job's removal arrives on the ship room, in no guaranteed order
    const promotions = new PromotionWatch();
    const loop = new EmitterLoop(200);
    loop.onLoop(() => {
        const levelOf = (id: string) => targetLevel(spaceDriver, shipDriver, id);
        const promoted = promotions.observe(
            jobs().map((job) => job.targetId),
            levelOf,
            Date.now(),
        );
        for (const { targetId, level } of promoted) {
            lastScan.setValue(`${targetName(spaceDriver, shipDriver, targetId)} → ${ScanLevel[level]}`);
        }
    });
    loop.start();
    panelCleanup.add(() => loop.stop());
    shipDriver.events.on('/signals/jobs', onJobsChange);
    shipDriver.events.on('/signals/jobs/**', onJobsChange);
    panelCleanup.add(() => {
        shipDriver.events.off('/signals/jobs', onJobsChange);
        shipDriver.events.off('/signals/jobs/**', onJobsChange);
    });
    onJobsChange();
}
