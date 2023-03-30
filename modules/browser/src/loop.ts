// TODO bettwr use requestAnimationFrame
abstract class BaseLoop {
    private t0 = 0;
    private timer: ReturnType<typeof setInterval> | null = null;
    protected abstract readonly interval: number;
    protected abstract readonly body: (deltaSeconds: number) => void;

    public isStarted() {
        return this.timer !== null;
    }
    public start() {
        if (this.timer === null) {
            this.t0 = Date.now();
            this.timer = setInterval(this.iteration, this.interval);
        }
    }

    public stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private iteration = () => {
        const t1 = Date.now();
        this.body((t1 - this.t0) / 1000);
        this.t0 = t1;
    };
}

export class EmitterLoop extends BaseLoop {
    private bodies: Array<(deltaSeconds: number) => void> = [];
    protected readonly body = (deltaSeconds: number) => {
        for (const b of this.bodies) {
            b(deltaSeconds);
        }
    };
    constructor(protected interval = 1000 / 60) {
        super();
    }
    onLoop(b: (deltaSeconds: number) => void) {
        this.bodies.push(b);
    }
}
