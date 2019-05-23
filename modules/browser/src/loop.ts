export class Loop {
  private t0: number = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private body: (delta: number) => void,
    private interval = 1000 / 60
  ) {}

  public start() {
    this.stop();
    this.t0 = Date.now();
    this.timer = setInterval(this.iteration, this.interval);
  }

  public stop() {
    if (this.timer !== null) {
      this.iteration();
      clearInterval(this.timer);
    }
  }

  private iteration = () => {
    const t1 = Date.now();
    this.body(t1 - this.t0);
    this.t0 = t1;
  }
}
