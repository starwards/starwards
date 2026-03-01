import { hsl, withAlpha } from '../colors';

import { type InputDescription } from '../input/input-manager';
import React from 'react';

interface HotkeyHelpModalProps {
    descriptions: InputDescription[];
    visible: boolean;
    onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    fontFamily: '"Titillium Web", monospace',
};

const panelStyle: React.CSSProperties = {
    position: 'relative',
    minWidth: '360px',
    maxWidth: '600px',
    maxHeight: '80vh',
    overflowY: 'auto',
    padding: '32px',
    border: `1px solid ${hsl.primary.main(5)}`,
    backgroundColor: withAlpha(hsl.primary.main(10), 0.3),
    boxShadow: `0 0 30px ${withAlpha(hsl.primary.main(5), 0.3)}, inset 0 0 30px ${withAlpha(hsl.primary.main(10), 0.2)}`,
};

const cornerStyle = (top: boolean, left: boolean): React.CSSProperties => ({
    position: 'absolute',
    width: '12px',
    height: '12px',
    borderColor: hsl.primary.main(3),
    borderStyle: 'solid',
    borderWidth: 0,
    ...(top ? { top: -1, borderTopWidth: 2 } : { bottom: -1, borderBottomWidth: 2 }),
    ...(left ? { left: -1, borderLeftWidth: 2 } : { right: -1, borderRightWidth: 2 }),
});

const titleStyle: React.CSSProperties = {
    margin: '0 0 24px 0',
    fontSize: '1.1rem',
    fontWeight: 600,
    letterSpacing: '4px',
    textTransform: 'uppercase',
    color: hsl.primary.main(3),
    textAlign: 'center',
};

const sectionTitleStyle: React.CSSProperties = {
    margin: '16px 0 8px 0',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '3px',
    textTransform: 'uppercase',
    color: hsl.primary.main(5),
    borderBottom: `1px solid ${hsl.primary.main(8)}`,
    paddingBottom: '4px',
};

const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '4px 0',
};

const badgeStyle: React.CSSProperties = {
    display: 'inline-block',
    minWidth: '100px',
    padding: '3px 8px',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    fontWeight: 600,
    color: hsl.primary.main(2),
    backgroundColor: withAlpha(hsl.primary.main(9), 0.4),
    border: `1px solid ${hsl.primary.main(7)}`,
    textAlign: 'center',
    whiteSpace: 'nowrap',
};

const labelStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    color: hsl.primary.main(4),
};

const footerStyle: React.CSSProperties = {
    marginTop: '24px',
    textAlign: 'center',
    fontSize: '0.75rem',
    letterSpacing: '2px',
    color: hsl.primary.main(6),
};

export const HotkeyHelpModal: React.FC<HotkeyHelpModalProps> = ({ descriptions, visible, onClose }) => {
    if (!visible) return null;

    const keyboard = descriptions.filter((d) => d.inputType === 'keyboard');
    const gamepadButtons = descriptions.filter((d) => d.inputType === 'gamepad-button');
    const gamepadAxes = descriptions.filter((d) => d.inputType === 'gamepad-axis');
    const hasGamepad = gamepadButtons.length > 0 || gamepadAxes.length > 0;

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
                {/* Corner decorations */}
                <div style={cornerStyle(true, true)} />
                <div style={cornerStyle(true, false)} />
                <div style={cornerStyle(false, true)} />
                <div style={cornerStyle(false, false)} />

                <h2 style={titleStyle}>CONTROLS</h2>

                {keyboard.length > 0 && (
                    <>
                        {hasGamepad && <div style={sectionTitleStyle}>KEYBOARD</div>}
                        {keyboard.map((d, i) => (
                            <div key={`kb-${i}`} style={rowStyle}>
                                <span style={badgeStyle}>{d.input}</span>
                                <span style={labelStyle}>{d.label}</span>
                            </div>
                        ))}
                    </>
                )}

                {gamepadButtons.length > 0 && (
                    <>
                        <div style={sectionTitleStyle}>GAMEPAD BUTTONS</div>
                        {gamepadButtons.map((d, i) => (
                            <div key={`gb-${i}`} style={rowStyle}>
                                <span style={badgeStyle}>{d.input}</span>
                                <span style={labelStyle}>{d.label}</span>
                            </div>
                        ))}
                    </>
                )}

                {gamepadAxes.length > 0 && (
                    <>
                        <div style={sectionTitleStyle}>GAMEPAD AXES</div>
                        {gamepadAxes.map((d, i) => (
                            <div key={`ga-${i}`} style={rowStyle}>
                                <span style={badgeStyle}>{d.input}</span>
                                <span style={labelStyle}>{d.label}</span>
                            </div>
                        ))}
                    </>
                )}

                <div style={footerStyle}>PRESS SPACE TO CLOSE</div>
            </div>
        </div>
    );
};
