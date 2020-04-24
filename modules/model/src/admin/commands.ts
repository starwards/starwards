export interface AdminCommands {
    StartGame: undefined;
}

export type AdminCommand = AdminCommands[keyof AdminCommands];
