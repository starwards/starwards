import { Faction } from '@starwards/core/internal';

/**
 * Whether a radar contact is an enemy ship of faction `own`: a ship whose faction is shown (only a
 * contact scanned to BASIC or better shows it) and is neither `own` nor the neutral Faction.NONE.
 * A leaf module so crew orders and brains share it without an import cycle.
 */
export function isEnemyShip(c: { type?: string; faction?: number }, own: number | undefined): boolean {
    const neutral: number = Faction.NONE;
    return c.type === 'Spaceship' && c.faction !== undefined && c.faction !== neutral && c.faction !== own;
}
