import { IssueOrderArg, ReportOrderProgressArg, RevokeOrderArg } from './crew-orders';

import { ShipState } from './ship-state';

/** Puts an order on the ship's order board (stances and `undock` included). Validated by `CrewOrdersManager`. */
export const issueOrder = {
    cmdName: 'issueOrder',
    setValue: (state: ShipState, value: IssueOrderArg) => {
        state.orderBoard.commands.push({ ...value, type: 'issue' });
    },
};

/** Empties one slot of the board; a captain's revoke hands the slot back to doctrine. */
export const revokeOrder = {
    cmdName: 'revokeOrder',
    setValue: (state: ShipState, value: RevokeOrderArg) => {
        state.orderBoard.commands.push({ ...value, type: 'revoke' });
    },
};

/** A seat's report of how far an order has got: its step, its completion or abort and why. */
export const reportOrderProgress = {
    cmdName: 'reportOrderProgress',
    setValue: (state: ShipState, value: ReportOrderProgressArg) => {
        state.orderBoard.commands.push({ ...value, type: 'progress' });
    },
};
