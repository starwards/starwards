import { Schema } from '@colyseus/schema';

import { gameField } from '../game-field';
import { range } from '../range';

export enum JobStatus {
    /** Retained, workable, and waiting for the working slot. */
    QUEUED,
    /** The single job the station is working right now. */
    IN_PROGRESS,
    /**
     * Retained but not workable — the target is out of the ship's field of view, or there is
     * nothing left to reveal at its current scan level. Clients must not present a dormant job
     * as next up: the station will skip it.
     */
    DORMANT,
}

export class SignalsJob extends Schema {
    @gameField('string')
    id = '';

    @gameField('string')
    targetId = '';

    @gameField('uint8')
    status: JobStatus = JobStatus.QUEUED;

    /**
     * A job the user explicitly prioritized: a standing order. Never auto-pruned and never
     * removed on completion — when there is nothing to work it lies dormant in place and resumes
     * on its own, so the queue order of prioritized jobs survives sight loss (e.g. a radar
     * restart) and scan-level demotion.
     */
    @gameField('boolean')
    prioritized = false;

    @range([0, 1])
    @gameField('float32')
    progress = 0;

    @gameField('float32')
    duration = 0;
}
