import { AdminState, GameStatus, ReplayRoom, SavedGame, ShipState, SpaceState } from '@starwards/core';
import { RecordingSource } from './recording-source';

/** a jump this far between frames is a teleport or a respawn, not motion */
const MAX_INTERPOLATED_JUMP = 1e5;

function lerp(a: number, b: number, alpha: number) {
    return a + (b - a) * alpha;
}

/** interpolates angles (degrees) along the shorter arc */
function lerpAngle(a: number, b: number, alpha: number) {
    const delta = ((((b - a) % 360) + 540) % 360) - 180;
    return a + delta * alpha;
}

/**
 * The rooms of a game as a recording replays it: one space room, one admin room and one room per ship,
 * all driven by the recorded frames. Ship rooms are created when a ship first appears and kept afterwards
 * (frozen while the ship is absent), so a driver made for a ship stays valid across seeks.
 */
export class ReplaySession {
    public readonly space = new ReplayRoom(SpaceState);
    public readonly admin = new ReplayRoom(AdminState);
    public readonly ships = new Map<string, ReplayRoom<ShipState>>();
    public interpolate = true;
    private appliedIndex = -1;
    private appliedAt = 0;

    constructor(public readonly source: RecordingSource) {}

    /** true when the frame for `t` is shown; false while it is still being decoded */
    update(t: number): boolean {
        const index = this.source.indexAt(t);
        const frame = this.source.peek(index);
        if (!frame) return false;
        const changed = index !== this.appliedIndex;
        // decode ahead, so playback never waits on the next frame
        const next = this.source.peek(index + 1);
        const now = performance.now();
        const animating = this.interpolate && next && now - this.appliedAt > 33;
        if (!changed && !animating) return true;
        if (changed) {
            this.applyFrame(frame);
            this.appliedIndex = index;
        }
        this.applySpace(frame, next, t, index);
        this.appliedAt = now;
        return true;
    }

    private applyFrame(frame: SavedGame) {
        const shipIds: string[] = [];
        const playerShipIds: string[] = [];
        for (const [id, ship] of frame.fragment.ship) {
            shipIds.push(id);
            if (ship.isPlayerShip) playerShipIds.push(id);
            let room = this.ships.get(id);
            if (!room) {
                room = new ReplayRoom(ShipState);
                this.ships.set(id, room);
            }
            room.apply(ship);
        }
        const admin = new AdminState();
        admin.gameStatus = GameStatus.RUNNING;
        admin.shipIds.push(...shipIds);
        admin.playerShipIds.push(...playerShipIds);
        this.admin.apply(admin);
    }

    private applySpace(frame: SavedGame, next: SavedGame | undefined, t: number, index: number) {
        const space = frame.fragment.space;
        if (!this.interpolate || !next) {
            this.space.apply(space);
            return;
        }
        const t0 = this.source.timeOf(index);
        const t1 = this.source.timeOf(index + 1);
        const alpha = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
        const target = next.fragment.space;
        this.space.apply(space, (source) => {
            for (const object of source) {
                const to = target.get(object.id);
                if (!to || to.type !== object.type) continue;
                if (
                    Math.hypot(to.position.x - object.position.x, to.position.y - object.position.y) >
                    MAX_INTERPOLATED_JUMP
                ) {
                    continue;
                }
                object.position.x = lerp(object.position.x, to.position.x, alpha);
                object.position.y = lerp(object.position.y, to.position.y, alpha);
                object.angle = lerpAngle(object.angle, to.angle, alpha);
            }
        });
    }
}
