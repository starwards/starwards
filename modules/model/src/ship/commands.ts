export interface ShipCommands {
    setAntiDrift: {
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
    setCombatManeuvers: {
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

export interface SmartPilotCommands {
    toggleSmartPilotManeuveringMode: Record<never, never>;
    toggleSmartPilotRotationMode: Record<never, never>;
    setSmartPilotRotation: {
        value: number;
    };
    setSmartPilotBoost: {
        value: number;
    };
    setSmartPilotStrafe: {
        value: number;
    };
}
export type ShipCommand = ShipCommands[keyof ShipCommands] | SmartPilotCommands[keyof SmartPilotCommands];
