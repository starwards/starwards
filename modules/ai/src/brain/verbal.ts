import { Faction, SmartPilotMode, StationRadarWidget, StationWidget } from '@starwards/core/internal';

import { Display } from './controls';

/**
 * The verbal UI: a station's display read out as the sentences an officer would say looking at the
 * screen. A person reads "12° right of the nose, closing" off a radar picture without arithmetic;
 * the model gets the same reading, written by these templates from exactly what the station
 * displays, so the comparisons stay in code and the judgement stays with the brain.
 */

type Contact = {
    id: string;
    name: string;
    scanLevel: string;
    distance: number;
    bearing: number;
    type?: string;
    faction?: number;
    heading?: number;
};
type Radar = {
    ownShip?: { id: string; heading: number };
    contacts?: Contact[];
    total?: number;
    scanBeam?: Beam | null;
    radarRange?: number;
};
type Beam = { bearing: number; arc: number; range: number };
type System = {
    name: string;
    status: string;
    heatStatus: string;
    power: number;
    coolantFactor: number;
    heat: number;
    broken: boolean;
    effectiveness: number;
};
type Gun = {
    index: number;
    projectile: string;
    loadedProjectile: string;
    loading: number;
    loadAmmo: boolean;
    isFiring: boolean;
    shellRange?: number;
};

/** What the reading needs besides the display: the previous reading, to say what is changing. */
export type ReadingContext = { panels: Display['panels']; previous: Map<string, number>; secondsSincePrevious: number };

type PanelTemplate = (panel: never, context: ReadingContext) => string[];

const metres = (m: number) => (m >= 10_000 ? `${(m / 1000).toFixed(0)} km` : `${Math.round(m).toLocaleString('en')} m`);
const percent = (x: number) => `${Math.round(x * 100)}%`;
const modeName = (mode: number) => SmartPilotMode[mode] ?? `mode ${mode}`;

/** Signed degrees from the nose to a bearing: positive is to the right. */
export function offNose(bearing: number, heading: number) {
    return ((((bearing - heading) % 360) + 540) % 360) - 180;
}

function sideOfNose(degrees: number) {
    const size = Math.abs(degrees);
    if (size < 1) return 'dead on the nose';
    if (size > 170) return 'dead astern';
    return `${size.toFixed(0)}° ${degrees > 0 ? 'right' : 'left'} of the nose`;
}

const systemLine = (s: System) =>
    `${s.name}: ${s.broken ? 'BROKEN' : s.status}, power ${percent(s.power)}, coolant ${percent(s.coolantFactor)}, heat ${s.heat.toFixed(0)} (${s.heatStatus}), working at ${percent(s.effectiveness)}`;

/** One template per panel a station can hold; radar panels are read by `readRadar`. */
const panelTemplates = {
    'helms-stats': (p: Record<string, number | { x: number; y: number }>) => {
        const mc = p.maneuveringCommand as { x: number; y: number };
        const turn = p.turnSpeed as number;
        return [
            `Heading ${(p.heading as number).toFixed(0)}°, speed ${(p.speed as number).toFixed(0)} m/s, ${Math.abs(turn) < 0.5 ? 'not turning' : `turning ${Math.abs(turn).toFixed(0)}°/s ${turn > 0 ? 'right' : 'left'}`}.`,
            `Rotation mode ${modeName(p.rotationMode as number)}${p.rotationMode === SmartPilotMode.TARGET ? ': the nose follows the weapons target by itself' : ''}; rotation keys set to ${(p.rotationCommand as number).toFixed(2)}.`,
            `Maneuvering mode ${modeName(p.maneuveringMode as number)}${p.maneuveringMode === SmartPilotMode.TARGET ? ': the ship matches the weapons target velocity, boost and strafe move it relative to the target' : ''}; boost set to ${mc.x.toFixed(2)}, strafe set to ${mc.y.toFixed(2)}.`,
            `Afterburner ${p.afterBurner ? 'held' : 'off'}, anti-drift ${p.antiDrift ? 'held' : 'off'}, brakes ${p.breaks ? 'held' : 'off'}. Energy ${(p.energy as number).toFixed(0)}, afterburner fuel ${(p.afterBurnerFuel as number).toFixed(0)}.`,
        ];
    },
    'systems-status': (p: System[]) => {
        // a station's own status strip draws healthy systems quietly; only trouble stands out
        const trouble = p.filter((s) => s.broken || s.status !== 'OK' || s.heatStatus !== 'OK');
        return [
            ...trouble.map(systemLine),
            `${p.length - trouble.length} of ${p.length} station systems working normally.`,
        ];
    },
    'full-systems-status': (p: System[]) => p.map(systemLine),
    'engineering-status': (p: { energy: number; afterBurnerFuel: number; hullDamaged: boolean }) => [
        `Energy store ${p.energy.toFixed(0)}, afterburner fuel ${p.afterBurnerFuel.toFixed(0)}, hull ${p.hullDamaged ? 'damaged' : 'intact'}.`,
    ],
    'warp-status': (p: {
        fitted: boolean;
        currentLevel?: number;
        desiredLevel?: number;
        jammed?: boolean;
        standbyFrequency?: number;
        currentFrequency?: number;
    }) =>
        p.fitted
            ? [
                  `Warp level ${p.currentLevel} (set to ${p.desiredLevel})${p.jammed ? ', JAMMED' : ''}, frequency ${p.currentFrequency}, standby frequency ${p.standbyFrequency}.`,
              ]
            : ['No warp drive.'],
    'docking-status': (p: { mode: number; targetId?: string }) => [
        p.targetId ? `Docking with ${p.targetId}.` : 'Not docking.',
    ],
    'armor-status': (p: { numberOfPlates: number; healthyPlates: number }) => [
        `Armor: ${p.healthyPlates} of ${p.numberOfPlates} plates intact.`,
    ],
    'damage-report': (p: { system: string; field: string; value: number; normal: number }[]) =>
        p.length
            ? p.map((d) => `Damage: ${d.system} ${d.field} at ${d.value.toFixed(2)} (normal ${d.normal}).`)
            : ['No damage reported.'],
    'repair-queue': (p: {
        slots: {
            protocolId: string;
            priority: string;
            progress: number;
            energyStarved: boolean;
            refusalReason?: string;
        }[];
    }) => {
        const active = p.slots.filter((s) => s.priority !== 'OFF');
        return active.length
            ? active.map(
                  (s) =>
                      `Repair ${s.protocolId}: ${s.priority}, ${percent(s.progress)} done${s.energyStarved ? ', starved of energy' : ''}${s.refusalReason ? `, refused: ${s.refusalReason}` : ''}.`,
              )
            : [`No repairs ordered. Protocols available: ${p.slots.map((s) => s.protocolId).join(', ')}.`];
    },
    'tubes-status': (p: Gun[]) =>
        p.map(
            (t) =>
                `Missile tube ${t.index}: ${t.loadedProjectile === 'None' ? `empty, ${t.loadAmmo ? `loading ${t.projectile} ${percent(t.loading)}` : 'not loading'}` : `${t.loadedProjectile} loaded`}.`,
        ),
    'gun-status': (p: Gun[]) =>
        p.map(
            (g) =>
                `Chain gun ${g.index}: ${g.isFiring ? 'FIRING' : 'not firing'}, ${g.loadedProjectile === 'None' ? (g.loadAmmo ? `loading ${g.projectile}` : 'not loading') : `${g.loadedProjectile} loaded`}, loading switch ${g.loadAmmo ? 'on' : 'off'}.`,
        ),
    'ammo-status': (p: { fitted: boolean; ammo?: Record<string, { count: number; max: number }> }) =>
        p.fitted && p.ammo
            ? [
                  `Magazine: ${Object.entries(p.ammo)
                      .filter(([, a]) => a.max > 0)
                      .map(([type, a]) => `${type} ${a.count} of ${a.max}`)
                      .join(', ')}.`,
              ]
            : ['No magazine.'],
    'targeting-status': (p: {
        targetId: string | null;
        shipOnly: boolean;
        enemyOnly: boolean;
        shortRangeOnly: boolean;
    }) => [
        p.targetId ? `Weapons locked on ${p.targetId}.` : 'No weapons lock.',
        `Targeting filters: ships only ${p.shipOnly ? 'on' : 'off'}, enemies only ${p.enemyOnly ? 'on' : 'off'}, short range only ${p.shortRangeOnly ? 'on' : 'off'}.`,
    ],
    'target-info': (p: { target: Contact | null }) => [
        p.target
            ? `Selected contact: ${p.target.name}, ${identity(p.target)}, ${metres(p.target.distance)}.`
            : 'No contact selected.',
    ],
    'signals-jobs': (p: {
        paused: boolean;
        jobs: { id: string; status: string; progress: number; target: Contact | { id: string } }[];
    }) => [
        p.jobs.length
            ? `Scan queue${p.paused ? ' (PAUSED)' : ''}: ${p.jobs.map((j) => `${'name' in j.target ? j.target.name : j.target.id} ${j.status} ${percent(j.progress)}`).join('; ')}.`
            : `Scan queue empty${p.paused ? ' (paused)' : ''}.`,
    ],
    'waypoint-groups': (p: Record<string, string[]>) => [
        `Waypoint groups: ${
            Object.entries(p)
                .map(([g, ids]) => `${g} (${ids.length})`)
                .join(', ') || 'none'
        }.`,
    ],
    'waypoint-edit': (p: { title: string; collection: string }[]) =>
        p.map((w) => `Waypoint ${w.title} in ${w.collection}.`),
} as const satisfies Record<Exclude<StationWidget, StationRadarWidget>, PanelTemplate>;

function identity(c: Contact) {
    if (c.scanLevel === 'UFO' || c.type === undefined) return 'unidentified';
    const faction = c.faction === undefined ? '' : `${Faction[c.faction] ?? `faction ${c.faction}`} `;
    return `${faction}${c.type}`;
}

function readRadar(radar: Radar, context: ReadingContext): string[] {
    const heading = radar.ownShip?.heading ?? 0;
    const lockedId = (context.panels['targeting-status'] as { targetId?: string | null } | undefined)?.targetId;
    const contacts = radar.contacts ?? [];
    const shells = contacts.filter((c) => c.type === 'Projectile').length;
    const lines = contacts
        .filter((c) => c.type !== 'Projectile')
        .map((c) => {
            const before = context.previous.get(c.id);
            const rate = before === undefined ? 0 : (before - c.distance) / context.secondsSincePrevious;
            const trend =
                before === undefined
                    ? ''
                    : Math.abs(rate) < 5
                      ? ', holding distance'
                      : `, ${rate > 0 ? 'closing' : 'opening'} at ${Math.abs(rate).toFixed(0)} m/s`;
            return `Contact ${c.name}${c.id === lockedId ? ' (LOCKED)' : ''}: ${identity(c)}, ${metres(c.distance)}, ${sideOfNose(offNose(c.bearing, heading))}${trend}.`;
        });
    if (!lines.length) lines.push('Radar: no contacts.');
    if (shells) lines.push(`${shells} of our own shells in flight.`);
    if (radar.scanBeam) {
        lines.push(
            `Scan beam pointed ${sideOfNose(radar.scanBeam.bearing)}, ${radar.scanBeam.arc.toFixed(0)}° wide, reaching ${metres(radar.scanBeam.range)}.`,
        );
    }
    return lines;
}

/**
 * A reader for one seat: it remembers the last radar picture so it can say what is closing or
 * opening, as an officer watching the screen would.
 */
export function verbalReader(secondsBetweenReadings: number) {
    let previous = new Map<string, number>();
    return (display: Display) => {
        const context: ReadingContext = {
            panels: display.panels,
            previous,
            secondsSincePrevious: secondsBetweenReadings,
        };
        const lines: string[] = [];
        if (display.radar) lines.push(...readRadar(display.radar, context));
        for (const [widget, panel] of Object.entries(display.panels)) {
            const template = panelTemplates[widget as keyof typeof panelTemplates] as
                ((p: unknown, c: ReadingContext) => string[]) | undefined;
            if (panel && typeof panel === 'object' && 'unreadable' in panel) {
                lines.push(`${widget}: unreadable.`);
            } else if (template) {
                lines.push(...template(panel, context));
            }
        }
        previous = new Map(((display.radar as Radar | undefined)?.contacts ?? []).map((c) => [c.id, c.distance]));
        return lines;
    };
}
