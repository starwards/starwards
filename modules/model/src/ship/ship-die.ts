export class ShipDie {
    private timeSinceUpdate = 0;
    private rolls = new Map<string, number>();

    constructor(public updateTimeInSeconds: number) {}

    public update(deltaSeconds: number) {
        this.timeSinceUpdate += deltaSeconds;
        if (this.timeSinceUpdate > this.updateTimeInSeconds) {
            this.rolls = new Map<string, number>();
            this.timeSinceUpdate = 0;
        }
    }

    public getRoll(id: string, min = 0, max = 1): number {
        if (!this.rolls.has(id)) {
            this.rolls.set(id, Math.random());
        }
        return (this.rolls.get(id) || 0) * (max - min) + min;
    }

    public getSuccess(id: string, successProbability: number): boolean {
        return this.getRoll(id) < successProbability;
    }
}
