// currently projectiles config is hard-coded. should move to a more dynamic solution in the future.
export enum ProjectileModel {
    None = -1,
    CannonShell,
}
export type ProjectileDesign = typeof cannonShell;
export const cannonShell = {
    name: 'cannon shell',
    radius: 1,
    explosion: {
        secondsToLive: 1,
        expansionSpeed: 100,
        damageFactor: 20,
        blastFactor: 1,
    },
};

export const projectileDesigns = {
    [ProjectileModel.CannonShell]: cannonShell,
};
export type ProjectileDesigns = typeof projectileDesigns;
