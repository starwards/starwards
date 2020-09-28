export interface ShipCommands {
    setRotation: {
        value: number;
    };
    setAntiDrift: {
        value: number;
    };
    setStrafe: {
        value: number;
    };
    setBoost: {
        value: number;
    };
    setBreaks: {
        value: number;
    };
    chainGun: {
        isFiring: boolean;
    };
    setTarget: {
        id: string | null;
    };
    setShellSecondsToLive: {
        value: number;
    };
    // changes to ship
    setConstant: {
        name: string;
        value: number;
    };
    setChainGunConstant: {
        name: string;
        value: number;
    };
}

export type ShipCommand = ShipCommands[keyof ShipCommands];
