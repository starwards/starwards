import { CrewOrderBoard, CrewOrdersManager, OrderIssuer, ShipState } from '@starwards/core/internal';
import {
    GivenOrder,
    OrderCommand,
    OrdersBoard,
    ProgressView,
    orderCommand,
    orderReports,
    readBoard,
    sendOrderCommand,
} from './orders';

/**
 * A real order board and its manager, for specs: orders go in through the board's commands and
 * land at the next `tick`, as on a ship.
 */
export function testBoard(energySeats: readonly string[] = ['helms', 'weapons', 'engineer']) {
    const board = new CrewOrderBoard();
    const manager = new CrewOrdersManager(board);
    let seconds = 0;
    const ship = { orderBoard: board } as ShipState;
    const driver = {
        command: (cmd: { setValue(s: ShipState, v: unknown): void }, v: unknown) => cmd.setValue(ship, v),
    };
    const send = (c: OrderCommand | undefined) => c && sendOrderCommand(driver as never, c);
    const api = {
        board,
        send,
        /** Lands the commands sent so far, at board time `at` (default one second on). */
        tick(at = seconds + 1) {
            seconds = at;
            manager.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: at });
            return api;
        },
        /** Gives orders and lands them. */
        give(orders: GivenOrder[], issuer: OrderIssuer = 'captain', origin = '') {
            for (const o of orders) send(orderCommand(o, issuer, origin));
            return api.tick(seconds);
        },
        /** What a seat reports from its view, landed. */
        report(view: Omit<ProgressView, 'seconds'>) {
            for (const c of orderReports(api.shown, { ...view, seconds })) send(c);
            return api.tick(seconds);
        },
        get shown(): OrdersBoard {
            return readBoard(board, energySeats) ?? { orders: [], priorities: [] };
        },
    };
    return api;
}
