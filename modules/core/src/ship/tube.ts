import { ChainGun } from './chain-gun';
import { getDirectionConfigFromAngle } from './ship-direction';

export class Tube extends ChainGun {
    public static isInstance = (o: unknown): o is Tube => {
        return (o as Tube)?.type === 'Tube';
    };

    public readonly type = 'Tube';
    get name() {
        return `Tube ${this.index} (${getDirectionConfigFromAngle(this.fittedBearing)})`;
    }
}
