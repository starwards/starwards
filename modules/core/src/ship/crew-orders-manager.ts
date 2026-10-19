import {
    CREW_ORDER_KINDS,
    CrewOrder,
    CrewOrderBoard,
    CrewOrderRef,
    FOCUS_PICKS,
    IssueOrderArg,
    NUMBER_PARAMS,
    ORDER_ISSUERS,
    ORDER_PARAMS,
    ORDER_SLOTS,
    ORDER_STATUSES,
    OrderParamName,
    OrderRefArg,
    REF_PARAMS,
    ReportOrderProgressArg,
    RevokeOrderArg,
} from './crew-orders';
import { IterationData, Updateable } from '../updateable';

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validRef(v: unknown): v is OrderRefArg {
    if (!isObject(v)) return false;
    const { name, position, radius } = v;
    return (
        (name === undefined || typeof name === 'string') &&
        (position === undefined || (isObject(position) && finite(position.x) && finite(position.y))) &&
        (radius === undefined || (finite(radius) && radius >= 0))
    );
}

/** An issue command that names a known kind, a known issuer and only that kind's parameters, each of its type. */
function validIssue(c: Record<string, unknown>): c is IssueOrderArg & Record<string, unknown> {
    const def = typeof c.kind === 'string' ? CREW_ORDER_KINDS[c.kind] : undefined;
    if (!def || !ORDER_ISSUERS.includes(c.issuer as never)) return false;
    if (c.origin !== undefined && typeof c.origin !== 'string') return false;
    const params = c.params ?? {};
    if (!isObject(params)) return false;
    for (const [name, value] of Object.entries(params)) {
        if (value === undefined) continue;
        if (!(name in def.params)) return false;
        const type = ORDER_PARAMS[name as OrderParamName];
        if (
            type === 'meters'
                ? !finite(value) || value < 0
                : type === 'share'
                  ? !finite(value) || value < 0 || value > 1
                  : type === 'count'
                    ? !Number.isInteger(value) || (value as number) < 1
                    : type === 'contacts'
                      ? !Array.isArray(value) || !value.length || !value.every(validRef)
                      : type === 'pick'
                        ? !FOCUS_PICKS.includes(value as never)
                        : !validRef(value)
        ) {
            return false;
        }
    }
    // a focus names its targets, a rule to pick them, or both; the station rule names its station
    if (c.kind === 'focus' && ((!params.targets && !params.pick) || (params.pick === 'nearest_to' && !params.station)))
        return false;
    return Object.entries(def.params).every(([name, need]) => need !== 'required' || params[name] !== undefined);
}

function writeRef(to: CrewOrderRef, from: OrderRefArg | undefined) {
    to.given = !!from;
    to.name = from?.name ?? '';
    to.positioned = !!from?.position;
    to.x = from?.position?.x ?? 0;
    to.y = from?.position?.y ?? 0;
    to.radius = from?.radius ?? 0;
}

const sameRef = (a: CrewOrderRef, b: CrewOrderRef) =>
    a.given === b.given &&
    a.name === b.name &&
    a.positioned === b.positioned &&
    a.x === b.x &&
    a.y === b.y &&
    a.radius === b.radius;

/**
 * Drains the order board's commands in the order they were sent, at its own update. Only it writes
 * the board. It checks shapes, never the world: it does not look up a named contact, so an order
 * carries exactly what its issuer saw and a refusal tells nothing about what exists.
 *
 * - `issue`: places the order in its kind's slot, revoking every order it contradicts. The same order
 *   again (kind and parameters) while the first is active is no change. A doctrine order never
 *   replaces or revokes a captain order: it is refused instead.
 * - `revoke`: empties a slot. Doctrine cannot revoke a captain order.
 * - `progress`: updates the named order while it is active (or marks a standing order fired);
 *   reports about an order no longer on the board are dropped.
 */
export class CrewOrdersManager implements Updateable {
    constructor(private readonly board: CrewOrderBoard) {}

    update({ totalSeconds }: IterationData) {
        this.board.seconds = totalSeconds;
        const commands: unknown[] = this.board.commands;
        this.board.commands = [];
        for (const c of commands) {
            if (!isObject(c)) continue;
            if (c.type === 'issue' && validIssue(c)) this.issue(c);
            else if (c.type === 'revoke') this.revoke(c as RevokeOrderArg);
            else if (c.type === 'progress') this.progress(c as ReportOrderProgressArg);
        }
    }

    private issue({ kind, params = {}, issuer, origin = '' }: IssueOrderArg) {
        const def = CREW_ORDER_KINDS[kind];
        const order = new CrewOrder();
        order.kind = kind;
        for (const name of REF_PARAMS) writeRef(order.params[name], params[name]);
        for (const name of NUMBER_PARAMS) order.params[name] = params[name] ?? 0;
        for (const t of params.targets ?? []) {
            const ref = new CrewOrderRef();
            writeRef(ref, t);
            order.params.targets.push(ref);
        }
        order.params.pick = params.pick ?? '';
        const current = this.board.slots.get(def.slot);
        if (current?.kind === kind && current.status === 'active' && this.sameParams(current, order)) return;
        const displaced = [...this.board.slots.entries()].filter(
            ([slot, o]) =>
                slot === def.slot ||
                def.contradicts?.includes(o.kind) ||
                CREW_ORDER_KINDS[o.kind]?.contradicts?.includes(kind),
        );
        if (issuer === 'doctrine' && displaced.some(([, o]) => o.issuer === 'captain')) return;
        for (const [slot] of displaced) this.board.slots.delete(slot);
        order.id = ++this.board.issued;
        order.issuer = issuer;
        order.origin = origin;
        order.issuedAt = this.board.seconds;
        this.board.slots.set(def.slot, order);
    }

    private sameParams(a: CrewOrder, b: CrewOrder) {
        return (
            REF_PARAMS.every((n) => sameRef(a.params[n], b.params[n])) &&
            NUMBER_PARAMS.every((n) => a.params[n] === b.params[n]) &&
            a.params.pick === b.params.pick &&
            a.params.targets.length === b.params.targets.length &&
            a.params.targets.every((t, i) => sameRef(t, b.params.targets[i]))
        );
    }

    private revoke({ slot, issuer }: RevokeOrderArg) {
        const current = ORDER_SLOTS.includes(slot) ? this.board.slots.get(slot) : undefined;
        if (!current || (issuer === 'doctrine' && current.issuer === 'captain')) return;
        this.board.slots.delete(slot);
    }

    private progress({ id, step, status, note, fired }: ReportOrderProgressArg) {
        const order = [...this.board.slots.values()].find((o) => o.id === id);
        if (!order) return;
        if (fired === true) order.fired = true;
        if (order.status !== 'active') return;
        if (typeof step === 'string' && step !== order.step) {
            order.step = step;
            order.stepAt = this.board.seconds;
        }
        if (typeof note === 'string') order.note = note;
        if (status !== undefined && ORDER_STATUSES.includes(status)) order.status = status;
    }
}
