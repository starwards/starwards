export class ShipDie {
    private timeSinceUpdate = 0;
    private rolls: number[] = [];
    private currentRoll = 0;

    constructor(public updateTimeInSeconds: number, public diceToRoll: number) {}

    public update(deltaSeconds: number) {
        this.timeSinceUpdate += deltaSeconds;
        if (this.timeSinceUpdate > this.updateTimeInSeconds) {
            this.rolls = [];
            this.timeSinceUpdate -= deltaSeconds;
        }
    }

    public getRoll(): number {
        this.currentRoll += 1;
        if (this.currentRoll > this.diceToRoll) {
            this.currentRoll = 0;
        }
        if (this.rolls.length < this.currentRoll) {
            this.rolls[this.currentRoll] = Math.random();
        }
        return this.rolls[this.currentRoll];
    }
}
