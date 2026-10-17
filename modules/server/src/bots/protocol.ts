import { BotBrain, BotStatus, BridgeSeat } from '@starwards/core/internal';

export type WorkerInit = { baseUrl: string; shipId: string };

export type ToWorker =
    | { type: 'seat'; seat: BridgeSeat; botId: string; brain: BotBrain }
    | { type: 'unseat'; seat: BridgeSeat }
    | { type: 'record'; on: boolean }
    | { type: 'stop' };

export type FromWorker =
    | { type: 'status'; seat: BridgeSeat; botId: string; status: BotStatus; message?: string }
    | { type: 'event'; kind: string; objectId?: string; data?: unknown }
    | { type: 'log'; level: 'info' | 'error'; message: string }
    | { type: 'stopped' };
