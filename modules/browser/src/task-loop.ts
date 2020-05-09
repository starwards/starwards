export class TaskLoop {
    private handle: ReturnType<typeof setTimeout> | null = null;
    constructor(private task: () => Promise<unknown>, private pause: number) {}

    private runTask = () => {
        this.task().then(
            () => {
                if (this.handle !== null) {
                    this.handle = setTimeout(this.runTask, this.pause);
                }
            },
            // tslint:disable-next-line:no-console
            (e) => console.error(`Error running task`, e)
        );
    };

    start = () => {
        if (this.handle === null) {
            this.handle = setTimeout(this.runTask, this.pause);
        }
    };

    stop = () => {
        if (this.handle !== null) {
            clearTimeout(this.handle);
            this.handle = null;
        }
    };
}
