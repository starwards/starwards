import { IssueOrderArg, ReportOrderProgressArg, RevokeOrderArg } from './crew-orders';

import { ShipState } from './ship-state';

/*
 * The issuer of an order is the command that carried it, never a field the sender sets: the server
 * has no per-connection identity (see `GM_SET_VALUE`), so a captain seat (bot or human) writes
 * through `issueOrder`/`revokeOrder`/`setStance`, and only the crew's doctrine runner writes
 * through `doctrineIssueOrder`/`doctrineRevokeOrder`. Any `issuer` in the value is overwritten.
 */

/** A captain's order onto the ship's order board (`undock` included; stances go through `setStance`). Validated by `CrewOrdersManager`. */
export const issueOrder = {
    cmdName: 'issueOrder',
    setValue: (state: ShipState, value: IssueOrderArg) => {
        state.orderBoard.commands.push({ ...value, issuer: 'captain', type: 'issue' });
    },
};

/** A captain's revoke: empties one slot of the board, handing it back to doctrine. */
export const revokeOrder = {
    cmdName: 'revokeOrder',
    setValue: (state: ShipState, value: RevokeOrderArg) => {
        state.orderBoard.commands.push({ ...value, issuer: 'captain', type: 'revoke' });
    },
};

/** The captain's stance: sets or replaces the order in the `stance` slot; only stance-slot kinds. */
export const setStance = {
    cmdName: 'setStance',
    setValue: (state: ShipState, value: IssueOrderArg) => {
        state.orderBoard.commands.push({ ...value, issuer: 'captain', type: 'stance' });
    },
};

/** Doctrine's order: fills a slot only while no captain order holds it. */
export const doctrineIssueOrder = {
    cmdName: 'doctrineIssueOrder',
    setValue: (state: ShipState, value: IssueOrderArg) => {
        state.orderBoard.commands.push({ ...value, issuer: 'doctrine', type: 'issue' });
    },
};

/** Doctrine's revoke: empties a slot doctrine holds; never a captain order. */
export const doctrineRevokeOrder = {
    cmdName: 'doctrineRevokeOrder',
    setValue: (state: ShipState, value: RevokeOrderArg) => {
        state.orderBoard.commands.push({ ...value, issuer: 'doctrine', type: 'revoke' });
    },
};

/** A seat's report of how far an order has got: its step, its completion or abort and why. */
export const reportOrderProgress = {
    cmdName: 'reportOrderProgress',
    setValue: (state: ShipState, value: ReportOrderProgressArg) => {
        state.orderBoard.commands.push({ ...value, type: 'progress' });
    },
};
