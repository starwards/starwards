import type { Control, Display } from '../brain/controls';

/**
 * The what-if plug-ins a brain file can name on a control (`"whatIf": "tailGeometry"`):
 * - `tailGeometry` (helms boost, strafe, afterburner): where the tracked contact and the firing
 *   position behind it will be a few seconds after this key.
 * - `noseOnContact` (helms rotation): how far off the nose the tracked contact will be.
 * - `gunLine` (weapons trigger): whether the locked target is on the gun line now and in a second.
 * - `energyHeat` (engineer power and coolant): the energy store and the system's heat in ten seconds.
 */
export const whatIfNames = ['tailGeometry', 'noseOnContact', 'gunLine', 'energyHeat'] as const;
export type WhatIfName = (typeof whatIfNames)[number];

/** What a plug-in is asked: one option of one control, on what the station shows. */
export type WhatIfContext = {
    /** What the station shows now. A plug-in reads nothing else of the game: the fog of war holds. */
    display: Display;
    /** What the station showed at the previous decision: a seat remembers its own screen. */
    previous?: Display;
    secondsSincePrevious: number;
    control: Control;
    option: string;
};

/**
 * The predicted effect of choosing an option. `phrase` is appended to the option's description.
 * `value` is the plug-in's heuristic indicator of the predicted state, higher is better, comparable
 * only between the options of one control: with it, the best option is marked for the model.
 */
export type WhatIfEffect = { phrase: string; value?: number };

/**
 * A what-if heuristic: roughly simulates choosing `option` and says what follows, or nothing when
 * the display does not show enough to tell.
 */
export type WhatIf = (context: WhatIfContext) => WhatIfEffect | undefined;
