import { commandable, gameField } from '../game-field';

import { ChainGun } from './chain-gun';
import { getDirectionConfigFromAngle } from './ship-direction';

export class Tube extends ChainGun {
    public static isInstance = (o: unknown): o is Tube => {
        return (o as Tube)?.type === 'Tube';
    };

    public readonly type = 'Tube';

    /** Auto-locks the instant this tube fires; unlocking is an explicit per-tube player action. */
    @commandable()
    @gameField('boolean')
    safetyLocked = true;

    get name() {
        return `Tube ${this.index} (${getDirectionConfigFromAngle(this.fittedBearing)})`;
    }
}
