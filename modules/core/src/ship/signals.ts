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
};

export class SignalsDesignState extends DesignState implements SignalsDesign {
    @gameField('float32') damage50 = 0;
    @gameField('float32') maxJobs = 9;
    @gameField('float32') scanBaseDuration = 5;
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

    /** Command properties (set by client via JSON pointer, consumed by manager on tick). */
    @commandable()
    public cancelJobId = '';

    /** Move a job to the top of the queue, making it the active job. */
    @commandable()
    public prioritizeJobId = '';

    /**
     * The target system the Signals officer is hacking on the marked target (`ShipState.signalsTargetId`):
     * a key of `HACK_CANDIDATE_SYSTEMS`, '' for none. Set to start a hack and cleared to cancel;
     * the manager also clears it when the hack completes or fails.
     */
    @commandable()
    @gameField('string')
    public hackSystem = '';

    /** Progress of the hack in `hackSystem`, 0 when idle. */
    @range([0, 1])
    @gameField('float32')
    public hackProgress = 0;

    /** Why the last hack ended without completing ('' when it did not, or none yet). */
    @gameField('string')
    public hackRefusal = '';

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

/**
 * Systems whose offline state changes an NPC's behaviour through the shared ship model, so a hack
 * on them is felt (beam hacking stage 1). Anything else is rejected as not hackable.
 */
export const HACKABLE_SYSTEM_KEYS = ['thrusters', 'chainGuns', 'smartPilot'] as const;
export type HackableSystemKey = (typeof HACKABLE_SYSTEM_KEYS)[number];

/** Systems the Signals officer can pick from; those outside {@link HACKABLE_SYSTEM_KEYS} show as not hackable. */
export const HACK_CANDIDATE_SYSTEMS = ['thrusters', 'chainGuns', 'smartPilot', 'armor'] as const;

export function isHackableSystemKey(value: string): value is HackableSystemKey {
    return (HACKABLE_SYSTEM_KEYS as readonly string[]).includes(value);
}
