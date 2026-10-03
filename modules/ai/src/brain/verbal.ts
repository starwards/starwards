import {
    Faction,
    PowerLevel,
    SmartPilotMode,
    StationRadarWidget,
    StationWidget,
    repairProtocols,
} from '@starwards/core/internal';

import { Display } from './controls';

/**
 * The verbal UI: a station's display read out as the sentences an officer would say looking at the
 * screen. A person reads "12° right of the nose, closing" off a radar picture without arithmetic;
 * the model gets the same reading, written by these templates from exactly what the station
 * displays, so the comparisons stay in code and the judgement stays with the brain.
 */

export type Contact = {
    id: string;
    name: string;
    scanLevel: string;
    distance: number;
    bearing: number;
    type?: string;
    faction?: number;
    heading?: number;
    position?: { x: number; y: number };
    /** The blip's size in metres: shown at every scan level. */
    radius?: number;
};
export type Radar = {
    ownShip?: { id: string; heading: number };
    contacts?: Contact[];
    total?: number;
    scanBeam?: Beam | null;
    radarRange?: number;
};
type Beam = { bearing: number; arc: number; range: number };
type System = {
    pointer?: string;
    name: string;
    status: string;
    heatStatus: string;
    power: number;
    coolantFactor: number;
    heat: number;
    broken: boolean;
    effectiveness: number;
    energyPerMinute?: number;
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

/** Where a contact was at the previous reading. */
type Sighting = { distance: number; position?: { x: number; y: number } };

/** What the reading needs besides the display: the previous reading, to say what is changing. */
export type ReadingContext = {
    panels: Display['panels'];
    previous: Map<string, Sighting>;
    secondsSincePrevious: number;
    /** Own heading, when the station has a radar: scan job targets are read relative to the nose. */
    heading?: number;
    /** The radar picture, when the station has one: panels may relate their reading to a contact on it. */
    radar?: Radar;
};

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

const powerName = (power: number) => (PowerLevel[power] as string | undefined) ?? percent(power);

/** The engineer's line per system: the pointer names the system the way its controls do. */
const engineerSystemLine = (s: System) =>
    `${s.name}${s.pointer ? ` [${s.pointer}]` : ''}: ${s.broken ? 'BROKEN' : s.status}, power ${powerName(s.power)}, coolant ${percent(s.coolantFactor)}, heat ${s.heat.toFixed(0)} of 100 (${s.heatStatus})${(s.energyPerMinute ?? 0) >= 0.5 ? `, using ${(s.energyPerMinute ?? 0).toFixed(0)} energy/min` : ''}.`;

/** Which repair protocols clear a damaged system field, by `<system key>.<field>`. */
const protocolsByDamage = new Map<string, string[]>();
for (const [id, protocol] of Object.entries(repairProtocols)) {
    for (const t of protocol.targets) {
        const key = `${t.system}.${t.field}`;
        protocolsByDamage.set(key, [...(protocolsByDamage.get(key) ?? []), id]);
    }
}
type Damage = { system: string; field: string; value: number; normal: number };
const fixedBy = (d: Damage) => protocolsByDamage.get(`${d.system.split('/')[1]}.${d.field}`) ?? [];

/** A shell's blast reaches this far each side of the nose line at the locked target's distance. */
const GUN_LINE_METRES = 100;

/** Whether the locked contact, as the radar shows it, lies within a blast's reach of the nose line. */
function gunLine(targetId: string | null, context: ReadingContext): string[] {
    const locked = targetId ? context.radar?.contacts?.find((c) => c.id === targetId) : undefined;
    if (!locked || context.heading === undefined) return [];
    const off = offNose(locked.bearing, context.heading);
    const aside = Math.abs(off) >= 90 ? Infinity : locked.distance * Math.sin((Math.abs(off) * Math.PI) / 180);
    return aside <= GUN_LINE_METRES
        ? ['The locked target is on the gun line at this range.']
        : [`The locked target is off the gun line, to the ${off > 0 ? 'right' : 'left'} of it.`];
}

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
    'full-systems-status': (p: System[]) => p.map(engineerSystemLine),
    'engineering-status': (
        p: {
            energy: number;
            maxEnergy?: number;
            energyCells?: number;
            maxEnergyCells?: number;
            afterBurnerFuel: number;
            hullDamaged: boolean;
        },
        context: ReadingContext,
    ) => {
        const store = p.maxEnergy ? p.energy / p.maxEnergy : undefined;
        const lines = [
            `Energy store ${p.energy.toFixed(0)}${store === undefined ? '' : ` of ${p.maxEnergy}, ${percent(store)} full${store < 0.25 ? ' (LOW)' : ''}`}${p.maxEnergyCells ? `, energy cells ${p.energyCells} of ${p.maxEnergyCells}` : ''}, afterburner fuel ${p.afterBurnerFuel.toFixed(0)}, hull ${p.hullDamaged ? 'damaged' : 'intact'}.`,
        ];
        const systems = context.panels['full-systems-status'] as System[] | undefined;
        if (Array.isArray(systems)) {
            const hot = systems.filter((s) => s.heat >= 1).sort((a, b) => b.heat - a.heat);
            lines.push(
                hot.length
                    ? `Hottest systems: ${hot
                          .slice(0, 3)
                          .map((s) => `${s.name} ${s.heat.toFixed(0)}`)
                          .join(', ')} (at 100 a system overheats and takes damage).`
                    : 'No system is warm.',
            );
            const broken = systems.filter((s) => s.broken).map((s) => s.name);
            if (broken.length) lines.push(`Broken systems: ${broken.join(', ')}.`);
        }
        return lines;
    },
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
    'damage-report': (p: Damage[]) =>
        p.length
            ? p.map((d) => {
                  const fixes = fixedBy(d);
                  return `Damage: ${d.system} ${d.field} at ${d.value.toFixed(2)} (normal ${d.normal})${fixes.length ? `, fixed by ${fixes.join(' or ')}` : ''}.`;
              })
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
                      `Repair ${s.protocolId}: ${s.priority}${s.priority === 'RUNNING' ? ' (either key now cancels it)' : ''}, ${percent(s.progress)} done${s.energyStarved ? ', starved of energy' : ''}${s.refusalReason ? `, refused: ${s.refusalReason}` : ''}.`,
              )
            : ['No repairs ordered.'];
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
    'targeting-status': (
        p: {
            targetId: string | null;
            shipOnly: boolean;
            enemyOnly: boolean;
            shortRangeOnly: boolean;
        },
        context: ReadingContext,
    ) => [
        p.targetId ? `Weapons locked on ${p.targetId}.` : 'No weapons lock.',
        ...gunLine(p.targetId, context),
        `Targeting filters: ships only ${p.shipOnly ? 'on' : 'off'}, enemies only ${p.enemyOnly ? 'on' : 'off'}, short range only ${p.shortRangeOnly ? 'on' : 'off'}.`,
    ],
    'target-info': (p: { target: Contact | null }) => [
        p.target
            ? `Selected contact: ${p.target.name}, ${identity(p.target)}, ${metres(p.target.distance)}.`
            : 'No contact selected.',
    ],
    'signals-jobs': (
        p: {
            paused: boolean;
            jobs: { id: string; status: string; progress: number; target: Contact | { id: string } }[];
        },
        context: ReadingContext,
    ) => [
        p.jobs.length
            ? `Scan queue${p.paused ? ' (PAUSED: nothing is being scanned)' : ''}: ${p.jobs
                  .map(
                      (j) =>
                          `${'name' in j.target ? j.target.name : j.target.id} ${j.status} ${percent(j.progress)}${'bearing' in j.target && context.heading !== undefined ? ` (${sideOfNose(offNose(j.target.bearing, context.heading))})` : ''}`,
                  )
                  .join('; ')}.`
            : `Scan queue empty${p.paused ? ' (PAUSED: nothing is being scanned)' : ''}.`,
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

/** Whether a contact `off` degrees from the nose lies within the beam's arc. */
function inside(off: number, beam: Beam) {
    return beam.arc >= 360 || Math.abs(offNose(off, beam.bearing)) <= beam.arc / 2;
}

/** A beam edge in degrees from the nose, wrapped to the side it lies on. */
function edge(degrees: number) {
    const d = offNose(degrees, 0);
    return Math.abs(d) < 1 ? '0°' : `${Math.abs(d).toFixed(0)}° ${d > 0 ? 'right' : 'left'}`;
}

/** A course this many degrees or more off the line of sight is read as slanting, not straight. */
const SLANT_DEGREES = 10;

/**
 * How the contact itself moves since the previous reading, against the line of sight from us to it:
 * away, toward, or across (to our right or left of the nose).
 */
function ownMotion(c: Contact, before: Contact['position'], heading: number, seconds: number) {
    if (!c.position || !before) return '';
    const vx = (c.position.x - before.x) / seconds;
    const vy = (c.position.y - before.y) / seconds;
    const speed = Math.hypot(vx, vy);
    if (speed <= 20) return '';
    const sight = (c.bearing * Math.PI) / 180;
    const radial = vx * Math.cos(sight) + vy * Math.sin(sight);
    const nose = (heading * Math.PI) / 180;
    const side = Math.cos(nose) * vy - Math.sin(nose) * vx > 0 ? 'right' : 'left';
    // away or toward: how far its course slants off the line of sight, so "straight away" is told apart
    const slant = (Math.acos(Math.min(1, Math.abs(radial) / speed)) * 180) / Math.PI;
    const slanting = slant >= SLANT_DEGREES ? `, slanting ${slant.toFixed(0)}° to our ${side}` : ', straight';
    const direction =
        radial > 0.7 * speed
            ? `away from us${slanting}`
            : radial < -0.7 * speed
              ? `toward us${slanting}`
              : `across, to our ${side}`;
    return `, itself moving ${speed.toFixed(0)} m/s ${direction}`;
}

/**
 * Below BASIC a blip has no type, but its size shows: a blip this small is a shell or a missile, not a
 * ship. Only size is used, so an unidentified contact is never classified by what it really is.
 */
const SHELL_SIZED_METRES = 5;
const shellSized = (c: Contact) => c.type === undefined && c.radius !== undefined && c.radius < SHELL_SIZED_METRES;

function readRadar(radar: Radar, context: ReadingContext): string[] {
    const heading = radar.ownShip?.heading ?? 0;
    const lockedId = (context.panels['targeting-status'] as { targetId?: string | null } | undefined)?.targetId;
    const contacts = radar.contacts ?? [];
    const shells = contacts.filter((c) => c.type === 'Projectile').length;
    const blips = contacts.filter(shellSized).length;
    const lines = contacts
        .filter((c) => c.type !== 'Projectile' && !shellSized(c))
        .map((c) => {
            const before = context.previous.get(c.id);
            const rate = before === undefined ? 0 : (before.distance - c.distance) / context.secondsSincePrevious;
            const trend =
                before === undefined
                    ? ''
                    : Math.abs(rate) < 5
                      ? ', holding distance'
                      : `, ${rate > 0 ? 'closing' : 'opening'} at ${Math.abs(rate).toFixed(0)} m/s`;
            const off = offNose(c.bearing, heading);
            const beam = radar.scanBeam
                ? inside(off, radar.scanBeam)
                    ? ', inside the scan beam'
                    : ', outside the scan beam'
                : '';
            return `Contact ${c.name}${c.id === lockedId ? ' (LOCKED)' : ''}: ${identity(c)}, ${metres(c.distance)}, ${sideOfNose(off)}${trend}${ownMotion(c, before?.position, heading, context.secondsSincePrevious)}${beam}.`;
        });
    if (!lines.length) lines.push('Radar: no contacts.');
    if (shells) lines.push(`${shells} of our own shells in flight.`);
    if (blips) lines.push(`${blips} unidentified shell-sized blips in flight.`);
    if (radar.scanBeam) {
        lines.push(
            `Scan beam pointed ${sideOfNose(radar.scanBeam.bearing)}, ${radar.scanBeam.arc.toFixed(0)}° wide (from ${edge(radar.scanBeam.bearing - radar.scanBeam.arc / 2)} to ${edge(radar.scanBeam.bearing + radar.scanBeam.arc / 2)} of the nose), reaching ${metres(radar.scanBeam.range)}.`,
        );
    }
    return lines;
}

/**
 * A reader for one seat: it remembers the last radar picture so it can say what is closing or
 * opening, as an officer watching the screen would.
 */
export function verbalReader(secondsBetweenReadings: number) {
    let previous = new Map<string, Sighting>();
    return (display: Display) => {
        const context: ReadingContext = {
            panels: display.panels,
            previous,
            secondsSincePrevious: secondsBetweenReadings,
            heading: (display.radar as Radar | undefined)?.ownShip?.heading,
            radar: display.radar as Radar | undefined,
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
        previous = new Map(
            ((display.radar as Radar | undefined)?.contacts ?? []).map((c) => [
                c.id,
                { distance: c.distance, position: c.position },
            ]),
        );
        return lines;
    };
}
