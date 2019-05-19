
export class Loop {
  public paused = true;
  private onStep: Array<(delta: number) => void> = [];
  private t0: number = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  public add(r: (delta: number) => void) {
      this.onStep.push(r);
  }

  public start() {
    this.stop();
    this.t0 = this.t0 || Date.now();
    this.timer = setInterval(() => {
      const t1 = Date.now();
      if (!this.paused) {
        const frameΔ = t1 - this.t0;
        for (const resolver of this.onStep) {
          resolver(frameΔ);
        }
      }
      this.t0 = t1;
    }, 1000 / 60);
  }

  public stop() {
      if (this.timer !== null) {
        clearInterval(this.timer);
      }
  }
}
