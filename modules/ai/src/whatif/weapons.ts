import { Radar, offNose } from '../brain/verbal';

import { Display } from '../brain/controls';
import { WhatIf } from './whatif';
import { XY } from '@starwards/core/internal';

/** A shell's blast reaches this far each side of the nose line (the verbal reading's gun line). */
const GUN_LINE_METERS = 100;
/** What the gunner knows of the GVTS chain gun without any display: its shells' fuse reaches this far. */
const SHELL_RANGE_METERS = 8000;
/** How far ahead the gun line is predicted. */
const AHEAD_SECONDS = 1;

type TacticalRadar = Omit<Radar, 'ownShip'> & { ownShip?: { heading: number; position?: XY } };
type Fix = { sight: XY; heading: number };

/** The locked target against the nose, as this display's radar shows it; nothing without a lock on the radar. */
function lockedFix(display: Display | undefined): Fix | undefined {
    const targetId = (display?.panels['targeting-status'] as { targetId?: string | null } | undefined)?.targetId;
    const radar = display?.radar as TacticalRadar | undefined;
    const locked = targetId ? radar?.contacts?.find((c) => c.id === targetId) : undefined;
    return locked?.position && radar?.ownShip?.position
        ? { sight: XY.difference(locked.position, radar.ownShip.position), heading: radar.ownShip.heading }
        : undefined;
}

/** Metres between the target and the nose line; infinite when the target is abeam or astern. */
function aside({ sight, heading }: Fix) {
    const off = Math.abs(offNose(XY.angleOf(sight), heading));
    return off >= 90 ? Infinity : XY.lengthOf(sight) * Math.sin((off * Math.PI) / 180);
}

const metres = (m: number) => (Number.isFinite(m) ? `${m.toFixed(0)} m off the gun line` : 'behind the gun');

/**
 * Weapons trigger: whether the locked target is within a blast of the gun line now, and in 1 s given
 * how the line of sight and the nose moved since the previous display. Indicator: firing is good
 * when the target is on the line now and stays there, bad when it is off it; holding fire is neutral.
 */
export const gunLine: WhatIf = ({ display, previous, secondsSincePrevious, control, option }) => {
    if (control.command !== 'fireChainGun') {
        return undefined;
    }
    const firing = option === 'fire';
    const now = lockedFix(display);
    if (!now) {
        return { phrase: 'No locked target on the radar: shells fired now are wasted.', value: firing ? -1 : 0 };
    }
    if (XY.lengthOf(now.sight) > SHELL_RANGE_METERS) {
        return {
            phrase: `The locked target is beyond the shells' ${SHELL_RANGE_METERS} m reach: shells fired now are wasted.`,
            value: firing ? -1 : 0,
        };
    }
    const before = lockedFix(previous);
    const ahead = before && {
        sight: XY.add(
            now.sight,
            XY.scale(XY.difference(now.sight, before.sight), AHEAD_SECONDS / secondsSincePrevious),
        ),
        heading: now.heading + (offNose(now.heading, before.heading) * AHEAD_SECONDS) / secondsSincePrevious,
    };
    const onNow = aside(now) <= GUN_LINE_METERS;
    const onAhead = ahead ? aside(ahead) <= GUN_LINE_METERS : onNow;
    const verdict = onNow
        ? onAhead
            ? { text: 'shells fired now hit', value: 1 }
            : { text: 'it is leaving the gun line, only the first shells hit', value: 0.5 }
        : onAhead
          ? { text: 'it is coming onto the gun line, shells fired now still miss', value: -0.5 }
          : { text: 'shells fired now miss', value: -1 };
    return {
        phrase: `The locked target is ${metres(aside(now))} now${ahead ? ` and ${metres(aside(ahead))} in ${AHEAD_SECONDS} s` : ''} (a blast reaches ${GUN_LINE_METERS} m): ${verdict.text}.`,
        value: firing ? verdict.value : 0,
    };
};
