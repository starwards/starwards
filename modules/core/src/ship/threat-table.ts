/**
 * An NPC's aggro character: how much damage it takes to pull it off its standing order, and how
 * long it holds a grudge. All weights are in `Damage.amount` units; the standing order ("the
 * mission") is a constant entry of `missionWeight` that never decays.
 * @see starwards-design mechanics/npc-aggro-threat-table.md
 */
export interface AggroCharacter {
    /** Threat a challenger needs to beat the mission; `Infinity` never leaves it. */
    readonly missionWeight: number;
    /**
     * How long a grudge holds at full strength after the attacker's last hit, and then the e-folding
     * time of its decay, seconds.
     */
    readonly memorySeconds: number;
    /** Fraction by which a challenger must exceed the held entry to take its place. */
    readonly switchMargin: number;
    /** Threat per second credited to every hostile in gun reach; 0 reacts to damage only. */
    readonly presenceRate: number;
}

/**
 * Calibrated so one full GVTS chain-gun burst flips a Brawler: a HiExp blast lands 20 damage on a
 * dragonfly-MK1, and one continuous burst at 2 km lands 23 of them (460). 250 flips at
 * 250 x (1 + 0.25) = 312.5, about 16 blasts. Hunter presence keeps the pin's ratio to the mission
 * (2/s against 30), scaled by the same factor.
 */
const MISSION_WEIGHT = 250;

export const aggroCharacters = {
    /** Never leaves its standing order. */
    Fixated: { missionWeight: Infinity, memorySeconds: 20, switchMargin: 0.25, presenceRate: 0 },
    /** Turns on whoever hurts it enough, drifts back to its order as the grudge fades. */
    Brawler: { missionWeight: MISSION_WEIGHT, memorySeconds: 20, switchMargin: 0.25, presenceRate: 0 },
    /** A Brawler that also builds a grudge against any hostile it can reach. */
    Hunter: {
        missionWeight: MISSION_WEIGHT,
        memorySeconds: 20,
        switchMargin: 0.25,
        presenceRate: (2 * MISSION_WEIGHT) / 30,
    },
} as const satisfies Record<string, AggroCharacter>;

export type AggroCharacterName = keyof typeof aggroCharacters;

/**
 * `character` re-weighted to `missionWeight`, e.g. per hull class. `presenceRate` scales with it,
 * so a proactive character's pull keeps its ratio to the mission. An infinite mission stays infinite.
 */
export function withMissionWeight(character: AggroCharacter, missionWeight: number): AggroCharacter {
    if (!Number.isFinite(character.missionWeight)) {
        return character;
    }
    return {
        ...character,
        missionWeight,
        presenceRate: (character.presenceRate * missionWeight) / character.missionWeight,
    };
}

/** `character` with `missionWeight` and `memorySeconds` each scaled by a factor in [0.9, 1.1] drawn from `rng`. */
export function withSpawnNoise(character: AggroCharacter, rng: () => number): AggroCharacter {
    const noise = () => 0.9 + rng() * 0.2;
    return {
        ...character,
        missionWeight: Number.isFinite(character.missionWeight)
            ? character.missionWeight * noise()
            : character.missionWeight,
        memorySeconds: character.memorySeconds * noise(),
    };
}

/**
 * Per-ship threat accumulator (the MMO threat table). Fed from weapon damage; each entry holds while
 * its attacker keeps hitting and decays once it has gone `memorySeconds` without a hit. `heldId` is
 * the attacker currently steering the ship, `null` while on mission. Aggressive response only: a held
 * attacker is engaged with the ship's own ATTACK behaviour.
 */
export class ThreatTable {
    /** `null`: no aggro -- the ship always follows its standing order. */
    character: AggroCharacter | null = null;
    heldId: string | null = null;
    /** How many times `heldId` changed, including returns to mission. */
    switches = 0;
    private readonly threat = new Map<string, number>();
    /** Table clock (sum of `update` deltas) at each attacker's latest hit. */
    private readonly lastHitAt = new Map<string, number>();
    private clock = 0;

    /** Credits `amount` of threat to `attackerId`. The caller filters self, friendly and unattributed damage. */
    add(attackerId: string, amount: number) {
        if (!this.character || !Number.isFinite(this.character.missionWeight) || amount <= 0) {
            return;
        }
        this.threat.set(attackerId, (this.threat.get(attackerId) ?? 0) + amount);
        this.lastHitAt.set(attackerId, this.clock);
    }

    get(attackerId: string): number {
        return this.threat.get(attackerId) ?? 0;
    }

    /**
     * Decays every grudge idle past `memorySeconds`, credits presence to `reachableHostileIds`
     * (presence is not a hit, so it decays like any idle grudge), forgets attackers `isGone`,
     * then lets the strongest challenger (the mission included) displace `heldId` by `switchMargin`.
     */
    update(deltaSeconds: number, reachableHostileIds: Iterable<string>, isGone: (id: string) => boolean) {
        const character = this.character;
        if (!character || !Number.isFinite(character.missionWeight)) {
            this.release();
            return;
        }
        this.clock += deltaSeconds;
        for (const [id, value] of this.threat) {
            const idle = this.clock - (this.lastHitAt.get(id) ?? -Infinity);
            const decaying = Math.min(deltaSeconds, idle - character.memorySeconds);
            if (decaying > 0) {
                this.threat.set(id, value * Math.exp(-decaying / character.memorySeconds));
            }
        }
        if (character.presenceRate > 0) {
            for (const id of reachableHostileIds) {
                this.threat.set(id, (this.threat.get(id) ?? 0) + character.presenceRate * deltaSeconds);
            }
        }
        for (const id of [...this.threat.keys()]) {
            if (isGone(id)) {
                this.drop(id);
            }
        }
        if (this.heldId !== null && !this.threat.has(this.heldId)) {
            this.setHeld(null);
        }
        let best: string | null = null;
        let bestValue = character.missionWeight;
        for (const [id, value] of this.threat) {
            if (value > bestValue) {
                best = id;
                bestValue = value;
            }
        }
        const heldValue = this.heldId === null ? character.missionWeight : this.get(this.heldId);
        if (best !== this.heldId && bestValue > heldValue * (1 + character.switchMargin)) {
            this.setHeld(best);
        }
        for (const [id, value] of this.threat) {
            if (id !== this.heldId && value < character.missionWeight * 1e-3) {
                this.drop(id);
            }
        }
    }

    /** Drops `id` and, if it was held, returns to mission. */
    forget(id: string) {
        this.drop(id);
        if (this.heldId === id) {
            this.setHeld(null);
        }
    }

    private drop(id: string) {
        this.threat.delete(id);
        this.lastHitAt.delete(id);
    }

    private release() {
        this.threat.clear();
        this.lastHitAt.clear();
        this.setHeld(null);
    }

    private setHeld(id: string | null) {
        if (id !== this.heldId) {
            this.heldId = id;
            this.switches++;
        }
    }
}
