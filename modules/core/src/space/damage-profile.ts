export const damageTypes = ['HiExp', 'ArmPen', 'Frag', 'Tandem', 'Elec'] as const;
export type DamageType = (typeof damageTypes)[number];

export interface DamageProfile {
    // damages external systems even when the armor blocks the hit
    readonly surfaceEffect: boolean;
    // a deflecting armor (e.g. reactive) can push the round away before its blast develops.
    // Shrapnel clouds cannot be deflected — only relevant for surfaceEffect types.
    readonly deflectable: boolean;
    readonly systemScope: 'single' | 'multi' | 'electronics';
    // false: only external systems are affected
    readonly hitsInternal: boolean;
    readonly systemDamageFactor: number;
}

export const damageProfiles: Readonly<Record<DamageType, DamageProfile>> = {
    HiExp: { surfaceEffect: true, deflectable: true, systemScope: 'multi', hitsInternal: true, systemDamageFactor: 1 },
    ArmPen: {
        surfaceEffect: false,
        deflectable: true,
        systemScope: 'single',
        hitsInternal: true,
        systemDamageFactor: 1.5,
    },
    Frag: {
        surfaceEffect: true,
        deflectable: false,
        systemScope: 'multi',
        hitsInternal: false,
        systemDamageFactor: 0.5,
    },
    Tandem: {
        surfaceEffect: false,
        deflectable: true,
        systemScope: 'multi',
        hitsInternal: true,
        systemDamageFactor: 1,
    },
    Elec: {
        surfaceEffect: false,
        deflectable: true,
        systemScope: 'electronics',
        hitsInternal: true,
        systemDamageFactor: 2,
    },
};
