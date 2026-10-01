import EventEmitter from 'eventemitter3';

export const PLAYBACK_RATES = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

/** Playback position, rate and play state, like a video element's. Time is game seconds. */
export class ReplayClock {
    public events = new EventEmitter<'change'>();
    private _position = 0;
    private _rate = 1;
    private _playing = false;
    private last = 0;
    private raf = 0;

    constructor(public readonly duration: number) {}

    get position() {
        return this._position;
    }
    get rate() {
        return this._rate;
    }
    get playing() {
        return this._playing;
    }
    get ended() {
        return this._position >= this.duration;
    }

    play() {
        if (this._playing) return;
        if (this.ended) this._position = 0;
        this._playing = true;
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.tick);
        this.events.emit('change');
    }

    pause() {
        if (!this._playing) return;
        this._playing = false;
        cancelAnimationFrame(this.raf);
        this.events.emit('change');
    }

    toggle() {
        if (this._playing) this.pause();
        else this.play();
    }

    seek(t: number) {
        this._position = Math.max(0, Math.min(t, this.duration));
        this.events.emit('change');
    }

    seekBy(delta: number) {
        this.seek(this._position + delta);
    }

    setRate(rate: number) {
        this._rate = rate;
        this.events.emit('change');
    }

    destroy() {
        cancelAnimationFrame(this.raf);
        this.events.removeAllListeners();
    }

    private tick = (now: number) => {
        if (!this._playing) return;
        const dt = (now - this.last) / 1000;
        this.last = now;
        this._position = Math.min(this.duration, this._position + dt * this._rate);
        if (this._position >= this.duration) {
            this._playing = false;
        } else {
            this.raf = requestAnimationFrame(this.tick);
        }
        this.events.emit('change');
    };
}
