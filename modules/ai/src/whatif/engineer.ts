import { Display } from '../brain/controls';
import { PowerLevel } from '@starwards/core/internal';
import { WhatIf } from './whatif';

/**
 * What the engineer knows of the GVTS without any display: its coolant removes this much heat per
 * second in all, shared out by the systems' coolant shares; a system run above NORMAL power heats by
 * this much per unit of energy it handles, once it handles more than the threshold per minute.
 */
const TOTAL_COOLANT = 10;
const HEAT_PER_ENERGY = 0.5;
const HEAT_ENERGY_PER_MINUTE_THRESHOLD = 20;
const MAX_HEAT = 100;
/** The power setting above which a system heats from its own energy flow. */
const NORMAL_POWER: number = PowerLevel.NORMAL;
/** How far ahead the energy store and the heat are predicted. */
const AHEAD_SECONDS = 10;

type System = { pointer?: string; power: number; coolantFactor: number; heat: number; energyPerMinute?: number };
type Engineering = { energy: number; maxEnergy?: number };

const systemsOf = (display: Display | undefined) => {
    const systems = display?.panels['full-systems-status'];
    return Array.isArray(systems) ? (systems as System[]) : undefined;
};
const engineeringOf = (display: Display | undefined) =>
    display?.panels['engineering-status'] as Engineering | undefined;

/** Heat per second a system makes from its own energy flow at this power: none at NORMAL or below. */
function powerHeat(power: number, energyPerMinute: number) {
    return power > NORMAL_POWER && energyPerMinute > HEAT_ENERGY_PER_MINUTE_THRESHOLD
        ? (energyPerMinute / 60) * HEAT_PER_ENERGY
        : 0;
}

/** Heat per second the coolant takes off a system holding `share` of `allShares` (even when no share is set). */
function cooling(share: number, allShares: number, systems: number) {
    return allShares > 0 ? (TOTAL_COOLANT * share) / allShares : TOTAL_COOLANT / systems;
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
const heatText = (heat: number) =>
    `this system's heat ${heat.toFixed(0)} of ${MAX_HEAT}${heat >= MAX_HEAT ? ' (OVERHEATS)' : ''}`;

/**
 * Engineer power and coolant steps: the energy store and the system's heat in 10 s, from the rates
 * the display shows (each system's energy per minute; the change of the store and of the heat since
 * the previous display). A power step scales the system's energy flow with its power (the reactor's
 * flow is what it generates); a coolant step re-shares the ship's coolant. No indicator: whether
 * energy or output matters more is the engineer's judgement.
 */
export const energyHeat: WhatIf = ({ display, previous, secondsSincePrevious, control, option }) => {
    const systems = systemsOf(display);
    const pointer = control.id.split(':')[1];
    const system = systems?.find((s) => s.pointer === pointer);
    const before = systemsOf(previous)?.find((s) => s.pointer === pointer);
    const status = engineeringOf(display);
    const statusBefore = engineeringOf(previous);
    if (!systems || !system || !before || !status || !statusBefore) {
        return undefined;
    }
    const pressed = control.press(option)?.value;
    const flow = system.energyPerMinute ?? 0;
    const heatRate = (system.heat - before.heat) / secondsSincePrevious;
    if (control.command === 'systemPower') {
        const power = typeof pressed === 'number' ? pressed : system.power;
        if (system.power <= 0 && power > 0) {
            // the display shows no flow for a system that is shut down, so there is nothing to scale
            return undefined;
        }
        const newFlow = system.power > 0 ? (flow * power) / system.power : 0;
        const storeRate = (status.energy - statusBefore.energy) / secondsSincePrevious;
        const generates = pointer === '/reactor' ? 1 : -1;
        const store = clamp(
            status.energy + (storeRate + (generates * (newFlow - flow)) / 60) * AHEAD_SECONDS,
            status.maxEnergy ?? Infinity,
        );
        const heat = clamp(
            system.heat + (heatRate - powerHeat(system.power, flow) + powerHeat(power, newFlow)) * AHEAD_SECONDS,
            MAX_HEAT,
        );
        const full = status.maxEnergy ? ` of ${status.maxEnergy}` : '';
        return {
            phrase: `In ${AHEAD_SECONDS} s: energy store ${store.toFixed(0)}${full}${store <= 0 ? ' (EMPTY)' : ''}, ${heatText(heat)}.`,
        };
    }
    if (control.command === 'systemCoolant') {
        const share = typeof pressed === 'number' ? pressed : system.coolantFactor;
        const shares = systems.reduce((sum, s) => sum + s.coolantFactor, 0);
        // a system at heat 0 may be cooled harder than it heats: only what shows is counted
        const made = heatRate + (system.heat > 0 ? cooling(system.coolantFactor, shares, systems.length) : 0);
        const cooled = cooling(share, shares - system.coolantFactor + share, systems.length);
        return {
            phrase: `In ${AHEAD_SECONDS} s: ${heatText(clamp(system.heat + (made - cooled) * AHEAD_SECONDS, MAX_HEAT))}.`,
        };
    }
    return undefined;
};
