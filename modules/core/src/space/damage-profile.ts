export const damageTypes = ['HiExp', 'ArmPen', 'Frag', 'Cluster', 'Tandem', 'Elec'] as const;
export type DamageType = (typeof damageTypes)[number];

export interface DamageProfile {
    // damages external systems even when the armor blocks the hit
    readonly surfaceEffect: boolean;
    readonly systemScope: 'single' | 'multi' | 'electronics';
    // false: only external systems are affected
    readonly hitsInternal: boolean;
    readonly systemDamageFactor: number;
}

export const damageProfiles: Readonly<Record<DamageType, DamageProfile>> = {
    HiExp: { surfaceEffect: true, systemScope: 'multi', hitsInternal: true, systemDamageFactor: 1 },
    ArmPen: { surfaceEffect: false, systemScope: 'single', hitsInternal: true, systemDamageFactor: 1.5 },
    Frag: { surfaceEffect: true, systemScope: 'multi', hitsInternal: false, systemDamageFactor: 0.5 },
    Cluster: { surfaceEffect: true, systemScope: 'multi', hitsInternal: false, systemDamageFactor: 1 },
    Tandem: { surfaceEffect: false, systemScope: 'multi', hitsInternal: true, systemDamageFactor: 1 },
    Elec: { surfaceEffect: false, systemScope: 'electronics', hitsInternal: true, systemDamageFactor: 2 },
};
