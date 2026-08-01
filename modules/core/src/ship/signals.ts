import { DesignState, SystemState, defectible } from './system';
import { commandable, gameField } from '../game-field';

import { ArraySchema } from '@colyseus/schema';
import { SignalsJob } from './signals-job';
import { range } from '../range';

export type SignalsDesign = {
    isInternal: boolean;
    isElectronics: boolean;
    damage50: number;
    maxJobs: number;
    scanBaseDuration: number;
    hackBaseDuration: number;
    hackEffectDuration: number;
    hackCooldown: number;
    hackBaseSuccessRate: number;
};

export class SignalsDesignState extends DesignState implements SignalsDesign {
    @gameField('float32') damage50 = 0;
    @gameField('float32') maxJobs = 9;
    @gameField('float32') scanBaseDuration = 5;
    @gameField('float32') hackBaseDuration = 45;
    @gameField('float32') hackEffectDuration = 150;
    @gameField('float32') hackCooldown = 60;
    @gameField('float32') hackBaseSuccessRate = 0.6;
}

export class Signals extends SystemState {
    public static isInstance = (o: unknown): o is Signals => {
        return (o as Signals)?.type === 'Signals';
    };

    public readonly type = 'Signals';
    public readonly name = 'Signals';

    @gameField(SignalsDesignState)
    design = new SignalsDesignState();

    @range([0, 1])
    @defectible({ normal: 1, name: 'job success' })
    @gameField('float32')
    jobSuccessFactor = 1;

    @range([0, 1])
    @defectible({ normal: 1, name: 'job speed' })
    @gameField('float32')
    jobSpeedFactor = 1;

    get broken() {
        return this.jobSpeedFactor <= 0;
    }

    @gameField([SignalsJob])
    jobs = new ArraySchema<SignalsJob>();

    /**
     * Command properties (set by client via JSON pointer, consumed by manager on tick).
     * Scan jobs are auto-managed; submission is for hack jobs only.
     */
    @commandable()
    public queueJobTargetId = '';

    @commandable()
    public queueJobHackSystemName = '';

    @commandable()
    public submitJobCommand = false;

    @commandable()
    public cancelJobId = '';

    /** Move a job to the top of the queue, making it the active job. */
    @commandable()
    public prioritizeJobId = '';

    /** Halts progress on all jobs while set (resource management); the queue itself keeps updating. */
    @commandable()
    public jobsPaused = false;

    /** Both damage factors reduce queue capacity: a damaged system can't manage as many concurrent tasks. */
    get currentMaxJobs(): number {
        if (this.broken) {
            return 0;
        }
        return Math.max(1, Math.ceil(this.design.maxJobs * this.jobSpeedFactor * this.jobSuccessFactor));
    }
}
