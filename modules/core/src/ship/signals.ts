import { DesignState, SystemState, defectible } from './system';
import { JobType, SignalsJob } from './signals-job';
import { commandable, gameField } from '../game-field';

import { ArraySchema } from '@colyseus/schema';
import { range } from '../range';

export type SignalsDesign = {
    isInternal?: boolean;
    damage50: number;
    maxJobs: number;
    maxTrackedTargets: number;
    scanBaseDuration: number;
    scanAdvancedFactor: number;
    hackBaseDuration: number;
    hackEffectDuration: number;
    hackCooldown: number;
    scanBaseSuccessRate: number;
    hackBaseSuccessRate: number;
};

export class SignalsDesignState extends DesignState implements SignalsDesign {
    @gameField('float32') damage50 = 0;
    @gameField('float32') maxJobs = 9;
    @gameField('float32') maxTrackedTargets = 3;
    @gameField('float32') scanBaseDuration = 20;
    @gameField('float32') scanAdvancedFactor = 2;
    @gameField('float32') hackBaseDuration = 45;
    @gameField('float32') hackEffectDuration = 150;
    @gameField('float32') hackCooldown = 60;
    @gameField('float32') scanBaseSuccessRate = 0.8;
    @gameField('float32') hackBaseSuccessRate = 0.6;
}

export class Signals extends SystemState {
    public static isInstance = (o: unknown): o is Signals => {
        return (o as Signals)?.type === 'Signals';
    };

    public readonly type = 'Signals';
    override readonly isElectronics = true;
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

    @gameField(['string'])
    trackedTargets = new ArraySchema<string>();

    // Command properties (set by client via JSON pointer, consumed by manager on tick)
    @commandable()
    public queueJobType: JobType | -1 = -1;

    @commandable()
    public queueJobTargetId = '';

    @commandable()
    public queueJobHackSystemName = '';

    @commandable()
    public submitJobCommand = false;

    @commandable()
    public cancelJobId = '';

    @commandable()
    public activateTrackTargetId = '';

    @commandable()
    public deactivateTrackTargetId = '';

    // Both damage factors reduce queue capacity: a damaged system can't manage as many concurrent tasks
    get currentMaxJobs(): number {
        if (this.broken) {
            return 0;
        }
        return Math.max(1, Math.ceil(this.design.maxJobs * this.jobSpeedFactor * this.jobSuccessFactor));
    }
}
