export const damageTypes = ['HiExp', 'ArmPen', 'Frag', 'Tandem', 'Elec'] as const;
export type DamageType = (typeof damageTypes)[number];

export interface DamageProfile {
    // damages external systems even when the armor blocks the hit
    readonly surfaceEffect: boolean;
    // a deflecting armor (e.g. reactive) can push the round away before its blast develops.
    // Shrapnel clouds cannot be deflected — only relevant for surfaceEffect types.
    readonly deflectable: boolean;
    // strength of the unconditional scrape on hull-mounted systems, relative to the hit amount.
    // Decoupled from systemDamageFactor: shrapnel is purpose-built to shred equipment (Frag 2),
    // a blast wave only washes over it (HiExp 0.25). 0 for types with no surface effect.
    readonly surfaceDamageFactor: number;
    readonly systemScope: 'single' | 'multi' | 'electronics';
    // false: only external systems are affected
    readonly hitsInternal: boolean;
    readonly systemDamageFactor: number;
}

export const damageProfiles: Readonly<Record<DamageType, DamageProfile>> = {
    HiExp: {
        surfaceEffect: true,
        deflectable: true,
        surfaceDamageFactor: 0.25,
        systemScope: 'multi',
        hitsInternal: true,
        systemDamageFactor: 1,
    },
    ArmPen: {
        surfaceEffect: false,
        deflectable: true,
        surfaceDamageFactor: 0,
        systemScope: 'single',
        hitsInternal: true,
        systemDamageFactor: 1.5,
    },
    Frag: {
        surfaceEffect: true,
        deflectable: false,
        surfaceDamageFactor: 2,
        systemScope: 'multi',
        hitsInternal: false,
        systemDamageFactor: 0.5,
    },
    // a slightly weaker ArmPen (factor 1 vs 1.5) whose niche is defeating reactive armor
    Tandem: {
        surfaceEffect: false,
        deflectable: true,
        surfaceDamageFactor: 0,
        systemScope: 'single',
        hitsInternal: true,
        systemDamageFactor: 1,
    },
    Elec: {
        surfaceEffect: false,
        deflectable: true,
        surfaceDamageFactor: 0,
        systemScope: 'electronics',
        hitsInternal: true,
        systemDamageFactor: 2,
    },
};
