import { blastHits, killedAt, lastFrameT, meanDistance, secondsFiring, shellsFired } from './metrics';
import { Store } from './store';

/**
 * The subset of `TrainingResult` computed from a finished store instead of inline in the run
 * loop -- one implementation, used both by `analyze` and by `runTraining` when recording is on
 * (see training-scenarios.ts). Field names and meanings match `TrainingResult` exactly so a
 * parity fixture can assert equality against the deleted inline code.
 */
interface ExtractedMetrics {
    readonly killed: boolean;
    readonly seconds: number;
    readonly armorStrippedAt: number | null;
    readonly targetHealth: number;
    readonly shellsFired: number;
    readonly secondsFiring: number;
    /** Distinct explosions that ever overlapped the target, from the recorder's sidecar; 0 without one. */
    readonly blastHits: number;
    readonly meanDistance: number;
    readonly targetDrift: number;
    readonly gvtsSpeed: number;
}

interface ExtractRoles {
    readonly playerId: string;
    readonly targetId: string;
}

export async function extractMetrics(store: Store, runId: string, roles: ExtractRoles): Promise<ExtractedMetrics> {
    const lastT = await lastFrameT(store, runId);
    const killed = (await killedAt(store, runId, roles.targetId)) !== null;

    const strippedRows = await store.all<{ t: number }>(
        "SELECT t FROM event WHERE run_id = ? AND object_id = ? AND kind = 'armor_stripped' ORDER BY t LIMIT 1",
        runId,
        roles.targetId,
    );
    const armorStrippedAt = strippedRows[0]?.t ?? null;

    const targetHealth = killed ? 0 : ((await store.valueAt(runId, roles.targetId, '/healthRatio', lastT))?.num ?? 1);

    const spawnX = (await store.valueAt(runId, roles.targetId, '/position/x', 0))?.num ?? 0;
    const spawnY = (await store.valueAt(runId, roles.targetId, '/position/y', 0))?.num ?? 0;
    const endX = (await store.valueAt(runId, roles.targetId, '/position/x', lastT))?.num ?? spawnX;
    const endY = (await store.valueAt(runId, roles.targetId, '/position/y', lastT))?.num ?? spawnY;

    const [gvx, gvy] = await Promise.all([
        store.valueAt(runId, roles.playerId, '/velocity/x', lastT),
        store.valueAt(runId, roles.playerId, '/velocity/y', lastT),
    ]);

    return {
        killed,
        seconds: lastT,
        armorStrippedAt,
        targetHealth,
        shellsFired: await shellsFired(store, runId, roles.playerId),
        secondsFiring: await secondsFiring(store, runId, roles.playerId),
        blastHits: await blastHits(store, runId, roles.targetId),
        meanDistance: await meanDistance(store, runId, roles.playerId, roles.targetId),
        targetDrift: Math.hypot(endX - spawnX, endY - spawnY),
        gvtsSpeed: Math.hypot(gvx?.num ?? 0, gvy?.num ?? 0),
    };
}
