type XY = { x: number; y: number };
type Ally = { id: string; name: string; position: XY; radius: number };
/** An ally the fire would endanger: its range from the ship (in line) or from the target (near it), metres. */
export type AllyAtRisk = { id: string; name: string; distance: number };

/**
 * The check-fire picture a weapons officer reads off the dradis: an ally the next round would cross,
 * and an ally the round's blast at the target would catch.
 *
 * In line: the ally's hull comes within `danger` (the loaded round's blast radius) of the gun's line
 * along the nose out to the shells' `reach`, or of the straight line to the locked `target` (a missile's
 * path). A shell that misses flies on past the target, so the nose line runs to full reach.
 * Near the target: the ally's hull lies within `danger` of the target.
 */
export function lineOfFire({
    position,
    bearing,
    reach,
    danger,
    target,
    allies,
}: {
    position: XY;
    /** World bearing of the gun, degrees. */
    bearing: number;
    reach: number;
    danger: number;
    target?: XY;
    allies: readonly Ally[];
}): { allyInLine: AllyAtRisk | null; allyNearTarget: AllyAtRisk | null } {
    const rad = (bearing * Math.PI) / 180;
    const nose = { x: Math.cos(rad), y: Math.sin(rad) };
    const toTarget = target && sub(target, position);
    const targetDistance = toTarget && Math.hypot(toTarget.x, toTarget.y);
    const crosses = (a: Ally, dir: XY, length: number) => {
        const rel = sub(a.position, position);
        const along = rel.x * dir.x + rel.y * dir.y;
        const across = Math.abs(rel.x * dir.y - rel.y * dir.x);
        const clearance = a.radius + danger;
        return along > 0 && along <= length + clearance && across <= clearance;
    };
    const inLine = allies
        .filter(
            (a) =>
                crosses(a, nose, reach) ||
                (toTarget && targetDistance ? crosses(a, scale(toTarget, 1 / targetDistance), targetDistance) : false),
        )
        .map((a) => risk(a, distance(a.position, position)))
        .sort((a, b) => a.distance - b.distance);
    const nearTarget = target
        ? allies
              .map((a) => ({ a, gap: distance(a.position, target) }))
              .filter(({ a, gap }) => gap <= a.radius + danger)
              .map(({ a, gap }) => risk(a, gap))
              .sort((a, b) => a.distance - b.distance)
        : [];
    return { allyInLine: inLine[0] ?? null, allyNearTarget: nearTarget[0] ?? null };
}

const risk = (a: Ally, d: number): AllyAtRisk => ({ id: a.id, name: a.name, distance: Math.round(d) });
const sub = (a: XY, b: XY) => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: XY, f: number) => ({ x: a.x * f, y: a.y * f });
const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
