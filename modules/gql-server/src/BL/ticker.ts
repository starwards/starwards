export class Ticker {
  private done = false;
  private counter = 0;
  private waitingIterators: Array<() => void> = [];

  public tick(): void {
    if (!this.done) {
      this.counter++;
      this.triggerIterators();
    }
  }

  public end(): void {
    this.done = true;
    this.triggerIterators();
  }

  public listen(): AsyncIterableIterator<null> {
    let count = this.counter;
    return {
      [Symbol.asyncIterator]() {return this; },
      next: () => this.next(count).finally(() => count = this.counter)
    };
  }

  private triggerIterators() {
    const old = this.waitingIterators;
    this.waitingIterators = [];
    old.forEach(i => i());
  }

  private async next(count: number): Promise<IteratorResult<null>> {
    while (!this.done && count === this.counter) {
      await new Promise(resolve => this.waitingIterators.push(resolve));
    }
    return { value: null, done: this.done };
  }
}
