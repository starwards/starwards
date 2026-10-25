/**
 * The physical heat model every chain gun obeys, player ship or NPC. Heat is on the 0-100 system
 * scale (`MAX_SYSTEM_HEAT`); a worn barrel pulls both bars down towards their `worn` values.
 */
export const GUN_HEAT = {
    /** pristine barrel: heat at which spread starts to grow */
    spreadBar: 50,
    /** pristine barrel: heat at which each shot may jam the gun */
    jamBar: 80,
    /** fully worn barrel: spread bar */
    wornSpreadBar: 25,
    /** fully worn barrel: jam bar */
    wornJamBar: 60,
    /** reaching 100 locks the gun until heat falls to this */
    cooldownRelease: 70,
    /** extra spread multiplier reached at heat 100 (1 + this) */
    maxHeatSpread: 3,
    /** extra base spread multiplier of a fully worn barrel (1 + this) */
    maxWearSpread: 2,
    /** probability that a shot fired at heat 100 jams the gun; scales linearly from 0 at the jam bar */
    maxJamChance: 0.1,
    /** seconds a jam stops the gun */
    jamSeconds: 3,
    /** barrel wear per second spent at or above the jam bar */
    wearPerSecondOverJamBar: 0.01,
    /** barrel wear per unit of heat pushed past 100 */
    wearPerOverflowHeat: 0.005,
} as const;

/** The spread and jam bars of a barrel with `wear` (0 pristine .. 1 fully worn). */
export function gunHeatBars(wear: number) {
    return {
        spreadBar: GUN_HEAT.spreadBar + (GUN_HEAT.wornSpreadBar - GUN_HEAT.spreadBar) * wear,
        jamBar: GUN_HEAT.jamBar + (GUN_HEAT.wornJamBar - GUN_HEAT.jamBar) * wear,
    };
}

/** Multiplier on the shot deviation caused by `heat` alone: 1 below the spread bar, growing to 1 + maxHeatSpread at 100. */
export function gunHeatSpreadFactor(wear: number, heat: number) {
    const { spreadBar } = gunHeatBars(wear);
    if (heat <= spreadBar) {
        return 1;
    }
    return 1 + GUN_HEAT.maxHeatSpread * Math.min(1, (heat - spreadBar) / (100 - spreadBar));
}
