import { Schema } from '@colyseus/schema';

import { gameField } from '../game-field';
import { range } from '../range';

export enum JobType {
    SCAN = 'scan',
    HACK = 'hack',
}

export enum JobStatus {
    QUEUED = 'queued',
    IN_PROGRESS = 'in_progress',
}

export class SignalsJob extends Schema {
    @gameField('string')
    id = '';

    @gameField('string')
    jobType: string = JobType.SCAN;

    @gameField('string')
    targetId = '';

    @gameField('string')
    hackSystemName = '';

    @gameField('string')
    status: string = JobStatus.QUEUED;

    @range([0, 1])
    @gameField('float32')
    progress = 0;

    @gameField('float32')
    duration = 0;
}
