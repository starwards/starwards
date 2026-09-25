import { AggroCharacter, ThreatTable } from './threat-table';

/**
 * An NPC's aggro: which attacker, if any, pulls it off its standing order. Owned by the NPC ship
 * manager alone, so a player ship has none and a converted ship starts with a fresh one. Fed hits
 * through `noteHit` and ticked through `update`, each with its inputs passed in explicitly.
 * @see starwards-design mechanics/npc-aggro-threat-table.md
 */
export class AggroManager {
    private readonly table = new ThreatTable();

    /** The NPC's aggro character; `null`: no aggro, the ship always follows its standing order. */
    get character(): AggroCharacter | null {
        return this.table.character;
    }
    set character(character: AggroCharacter | null) {
        this.table.character = character;
    }

    /** The attacker currently steering the ship, `null` while it follows its standing order. */
    get heldId(): string | null {
        return this.table.heldId;
    }

    /** Credits a weapon hit's `amount` to `attackerId`. The caller filters self, friendly and unattributed hits. */
    noteHit(attackerId: string, amount: number) {
        this.table.add(attackerId, amount);
    }

    /**
     * Advances the grudges by `deltaSeconds`: decay, presence credit to `reachableHostileIds`, dropping
     * attackers `isGone`, then re-picks `heldId`. `reachableHostileIds` is iterated only by a proactive
     * character (`presenceRate > 0`), so a lazy iterable costs a reactive one nothing.
     */
    update(deltaSeconds: number, reachableHostileIds: Iterable<string>, isGone: (id: string) => boolean) {
        this.table.update(deltaSeconds, reachableHostileIds, isGone);
    }

    /** Drops the grudge against `id`; if it was held, the ship returns to its standing order. */
    forget(id: string) {
        this.table.forget(id);
    }
}
