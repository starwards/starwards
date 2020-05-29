export interface AdminCommands {
    startGame: undefined;
}

export type AdminCommand = AdminCommands[keyof AdminCommands];
