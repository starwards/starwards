import { hsl, withAlpha } from '../colors';
import { AdminDriver } from '@starwards/core';

/** What the GM chip shows: a timeline being captured. */
type ObservationView = {
    /** Seconds into the timeline. */
    position: number;
    /** The timeline is not advancing — paused by the GM. */
    held: boolean;
    /** Headline word for what is happening. */
    label: string;
    /** Sub-label under the headline. */
    mode: string;
};

const STYLE_ELEMENT_ID = 'observation-mode-style';
const ACCENT = hsl.primary.main(2);
const ACCENT_DIM = hsl.primary.main(5);

// Bebas is the radar's own label font, so the chip reads as another instrument rather than as
// browser chrome sitting on top of one.
const CSS = `
.observation-chip {
    position: relative;
    display: none;
    align-items: center;
    gap: 14px;
    padding: 7px 16px 7px 14px;
    font-family: Bebas, sans-serif;
    font-size: 15px;
    line-height: 1;
    letter-spacing: 3px;
    white-space: nowrap;
    color: ${ACCENT};
    background: ${withAlpha(hsl.background, 0.72)};
    border: 1px solid ${withAlpha(ACCENT, 0.45)};
    box-shadow: 0 0 12px ${withAlpha(ACCENT, 0.18)}, inset 0 0 18px ${withAlpha(ACCENT, 0.06)};
    backdrop-filter: blur(3px);
    overflow: hidden;
    pointer-events: none;
}
/* inline-flex so the chip shrink-wraps its content wherever it is hung */
.observation-chip[data-active='true'] {
    display: inline-flex;
}
/* downward notch: the chip hangs off the top edge of the screen, not floats above it */
.observation-chip::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -7px;
    width: 12px;
    height: 12px;
    transform: translateX(-50%) rotate(45deg);
    background: ${withAlpha(hsl.background, 0.72)};
    border-right: 1px solid ${withAlpha(ACCENT, 0.45)};
    border-bottom: 1px solid ${withAlpha(ACCENT, 0.45)};
}
.observation-scanline {
    position: absolute;
    top: 0;
    left: 0;
    width: 40%;
    height: 100%;
    background: linear-gradient(90deg, transparent, ${withAlpha(ACCENT, 0.1)}, transparent);
    animation: observation-sweep 7s linear infinite;
}
@keyframes observation-sweep {
    0% { transform: translateX(-100%); }
    35%, 100% { transform: translateX(350%); }
}
.observation-glyph {
    font-size: 13px;
    animation: observation-pulse 2.4s ease-in-out infinite;
}
@keyframes observation-pulse {
    0%, 100% { opacity: 1; text-shadow: 0 0 6px ${withAlpha(ACCENT, 0.8)}; }
    50% { opacity: 0.45; text-shadow: none; }
}
.observation-mode {
    color: ${ACCENT_DIM};
    font-size: 12px;
}
.observation-clock {
    font-size: 13px;
    color: ${ACCENT_DIM};
}
.observation-hold {
    font-size: 12px;
    color: ${withAlpha(ACCENT, 0.5)};
}
`;

function installStyle() {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

function clock(seconds: number) {
    const whole = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The status chip. Rendered as plain DOM (not a Tweakpane panel) so it reads as an instrument:
 * one accent color, the radar's font, a live timeline. It never intercepts pointer events.
 */
export function drawObservationMode(container: { getElement(): { append(node: HTMLElement): unknown } }) {
    installStyle();
    const element = container.getElement();
    const chip = document.createElement('div');
    chip.className = 'observation-chip';
    chip.dataset.id = 'observation-mode';
    chip.dataset.active = 'false';
    chip.innerHTML = `
        <span class="observation-scanline"></span>
        <span class="observation-glyph">&#9672;</span>
        <span class="observation-label"></span>
        <span class="observation-mode"></span>
        <span class="observation-clock"></span>
        <span class="observation-hold"></span>`;
    element.append(chip);

    const clockText = chip.querySelector<HTMLElement>('.observation-clock');
    const hold = chip.querySelector<HTMLElement>('.observation-hold');
    const label = chip.querySelector<HTMLElement>('.observation-label');
    const mode = chip.querySelector<HTMLElement>('.observation-mode');

    return {
        show(view: ObservationView) {
            chip.dataset.active = 'true';
            if (label) label.textContent = view.label;
            if (mode) mode.textContent = view.mode;
            if (clockText) clockText.textContent = clock(view.position);
            if (hold) hold.textContent = view.held ? 'HELD' : '';
        },
        hide() {
            chip.dataset.active = 'false';
        },
    };
}

/**
 * The chip for the GM, hung off the top of the window rather than inside a widget: the GM
 * has to know a recording is running whichever dashboard tab happens to be focused, and a panel
 * they docked away cannot tell them.
 */
export function drawGmStatusChip(adminDriver: AdminDriver) {
    const holder = document.createElement('div');
    holder.style.cssText =
        'position: fixed; top: 0; left: 50%; transform: translateX(-50%); z-index: 100; pointer-events: none;';
    document.body.appendChild(holder);
    const chip = drawObservationMode({ getElement: () => holder });
    const render = () => {
        const state = adminDriver.state;
        if (state.isRecordingGame) {
            chip.show({
                position: state.recordingSeconds,
                held: state.speed === 0,
                label: 'REC',
                mode: state.recordingName,
            });
        } else {
            chip.hide();
        }
    };
    adminDriver.events.on('**', render);
    render();
}
