import { Control, Display } from '../brain/controls';
import { WhatIf, WhatIfEffect, WhatIfName } from './whatif';
import { noseOnContact, tailGeometry } from './helms';

import { BrainSpec } from '../brain/spec';
import { energyHeat } from './engineer';
import { gunLine } from './weapons';

const whatIfs = { tailGeometry, noseOnContact, gunLine, energyHeat } as const satisfies Record<WhatIfName, WhatIf>;

/** Per control id, per option: the predicted effect sentence appended to that option's description. */
export type Forecasts = Record<string, Record<string, string>>;

const BEST = 'Best forecast of these options.';

/**
 * The sentences of one control's options. When at least two options carry an indicator value, the
 * highest is marked best (a tie goes to the option that presses nothing, then to the first), so the
 * comparison between numbers is made here, not by the model.
 */
export function forecastPhrases(control: Control, effects: Record<string, WhatIfEffect | undefined>) {
    const valued = Object.entries(effects).flatMap(([option, e]) =>
        e?.value === undefined ? [] : [{ option, value: e.value }],
    );
    const top = Math.max(...valued.map((v) => v.value));
    const tied = valued.filter((v) => v.value === top).map((v) => v.option);
    const best = valued.length < 2 ? undefined : tied.includes(control.rest) ? control.rest : tied[0];
    const phrases: Record<string, string> = {};
    for (const [option, effect] of Object.entries(effects)) {
        if (effect) {
            phrases[option] = option === best ? `${effect.phrase} ${BEST}` : effect.phrase;
        }
    }
    return phrases;
}

/**
 * A forecaster for one seat, or nothing for a brain that names no what-if: for every control whose
 * wording names a plug-in it asks the plug-in about each option. It remembers the previous display,
 * as the seat's officer remembers the last look at the screen, so plug-ins can tell motion and rates.
 */
export function whatIfForecaster(spec: BrainSpec) {
    if (!Object.values(spec.controls).some((wording) => wording.whatIf)) {
        return undefined;
    }
    let previous: Display | undefined;
    return (display: Display, controls: readonly Control[]): Forecasts => {
        const forecasts: Forecasts = {};
        for (const control of controls) {
            const wording = { ...spec.controls[control.command], ...spec.controls[control.id] };
            if (!wording.whatIf || wording.skip) {
                continue;
            }
            const whatIf: WhatIf = whatIfs[wording.whatIf];
            const effects = Object.fromEntries(
                Object.keys(control.options).map((option) => [
                    option,
                    whatIf({ display, previous, secondsSincePrevious: spec.decisionSeconds, control, option }),
                ]),
            );
            forecasts[control.id] = forecastPhrases(control, effects);
        }
        previous = display;
        return forecasts;
    };
}

/** Appends each option's forecast to its description. */
export function withForecasts(criteria: Record<string, string>, forecasts: Record<string, string> | undefined) {
    return forecasts
        ? Object.fromEntries(
              Object.entries(criteria).map(([o, d]) => [
                  o,
                  forecasts[o] ? `${d.replace(/\.$/, '')}. ${forecasts[o]}` : d,
              ]),
          )
        : criteria;
}
