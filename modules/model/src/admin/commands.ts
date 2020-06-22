export interface AdminCommands {
    startGame: undefined;
    stopGame: undefined;
}

export type AdminCommand = AdminCommands[keyof AdminCommands];
