import { createLogger } from './logger';

const { error: logError } = createLogger('task-loop');

export class TaskLoop {
    private handle: ReturnType<typeof setTimeout> | null = null;
    constructor(
        private task: () => unknown,
        private pause: number,
    ) {}

    private runTask = async () => {
        while (this.handle !== null) {
            try {
                await this.task();
                if (this.handle !== null) {
                    await new Promise((res) => {
                        this.handle = setTimeout(res, this.pause);
                    });
                }
            } catch (e) {
                logError(`Error running task`, e);
            }
        }
    };

    start = () => {
        if (this.handle === null) {
            this.handle = setTimeout(() => void this.runTask(), this.pause);
        }
    };

    stop = () => {
        if (this.handle !== null) {
            clearTimeout(this.handle);
            this.handle = null;
        }
    };
}
