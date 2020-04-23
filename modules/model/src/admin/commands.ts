export interface AdminCommands {
    StartGame: {
        type: 'StartGame';
    };
}

export function isAdminCommand<T extends keyof AdminCommands>(
    type: T,
    command: AdminCommand
): command is AdminCommands[T] {
    return command.type === type;
}

export type AdminCommand = AdminCommands[keyof AdminCommands];
