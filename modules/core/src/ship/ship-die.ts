import { IterationData, Updateable } from '../updateable';

export class ShipDie implements Updateable {
    private timeSinceUpdate = 0;
    private rolls = new Map<string, number>();

    constructor(public updateTimeInSeconds: number) {}

    public update({ deltaSeconds }: IterationData) {
        this.timeSinceUpdate += deltaSeconds;
        if (this.timeSinceUpdate > this.updateTimeInSeconds) {
            this.rolls = new Map<string, number>();
            this.timeSinceUpdate = 0;
        }
    }

    public getRoll(id: string): number {
        if (!this.rolls.has(id)) {
            this.rolls.set(id, Math.random());
        }
        return this.rolls.get(id) || 0;
    }

    public getRollInRange(id: string, min: number, max: number): number {
        return this.getRoll(id) * (max - min) + min;
    }

    public getSuccess(id: string, successProbability: number): boolean {
        return this.getRoll(id) < successProbability;
    }
}
