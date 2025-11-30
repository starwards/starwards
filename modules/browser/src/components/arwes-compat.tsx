/**
 * Arwes Compatibility Layer
 *
 * Wraps @arwes/react (1.0.0-next) primitives to provide alpha.19 API compatibility.
 * Uses best practices from official Arwes documentation.
 */

import {
    Animated,
    Animator,
    AnimatorGeneralProvider as ArwesAnimatorGeneralProvider,
    BleepsProvider as ArwesBleepsProvider,
    FrameCorners as ArwesFrameCorners,
    Text as ArwesText,
    BleepsOnAnimator,
    fade,
    useBleeps,
} from '@arwes/react';
import { type CSSObject, Global } from '@emotion/react';
import type { CSSProperties, ReactNode } from 'react';
import React from 'react';

// Baseline styles for Arwes theme
const stylesBaseline: Record<string, CSSObject> = {
    '*, *::before, *::after': {
        boxSizing: 'border-box',
    },
    body: {
        margin: 0,
        padding: 0,
        backgroundColor: '#000',
        color: 'rgba(126, 252, 246, 0.8)',
        fontFamily: '"Titillium Web", sans-serif',
    },
};

// Color palette matching alpha.19 API
const paletteColors = {
    primary: 'rgb(126, 252, 246)',
    secondary: 'rgb(180, 144, 252)',
    success: 'rgb(33, 128, 141)',
    error: 'rgb(192, 21, 47)',
    control: 'rgb(126, 252, 246)',
};

type PaletteType = keyof typeof paletteColors;

// ============================================================================
// Button Component
// ============================================================================

interface ButtonProps {
    children?: ReactNode;
    onClick?: () => void;
    palette?: PaletteType;
    disabled?: boolean;
    active?: boolean;
    layer?: PaletteType; // Alias for palette
    style?: CSSProperties;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    onClick,
    palette = 'control',
    disabled = false,
    active = false,
    layer,
    style,
}) => {
    const bleeps = useBleeps();
    const colorKey = layer || palette;
    const color = paletteColors[colorKey];

    return (
        <Animator merge combine manager="stagger">
            <BleepsOnAnimator transitions={{ entering: 'intro' }} continuous />

            <Animated
                as="button"
                className={`arwes-button arwes-button--${colorKey}`}
                disabled={disabled}
                data-active={active}
                style={{
                    position: 'relative',
                    padding: '12px 24px',
                    background: 'transparent',
                    border: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    color: 'inherit',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    ...style,
                }}
                animated={disabled ? [] : [fade()]}
                onClick={() => {
                    if (!disabled) {
                        bleeps.click?.play();
                        onClick?.();
                    }
                }}
            >
                <style>{`
                    .arwes-button--${colorKey} .arwes-react-frames-framesvg [data-name=line] {
                        color: ${color};
                    }
                    .arwes-button--${colorKey}:hover:not(:disabled) .arwes-react-frames-framesvg [data-name=bg] {
                        color: ${color}33;
                    }
                    .arwes-button--${colorKey}[data-active=true] .arwes-react-frames-framesvg [data-name=bg] {
                        color: ${color}66;
                    }
                `}</style>

                <Animator>
                    <ArwesFrameCorners strokeWidth={2} />
                </Animator>

                <Animator>
                    <ArwesText as="span">{children}</ArwesText>
                </Animator>
            </Animated>
        </Animator>
    );
};

// ============================================================================
// Card Component
// ============================================================================

interface CardProps {
    children?: ReactNode;
    title?: string;
    image?: { src: string };
    options?: ReactNode;
    style?: CSSProperties;
    hover?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, title, image, options, style, hover = false }) => {
    const bleeps = useBleeps();

    return (
        <Animator merge combine manager="stagger">
            <BleepsOnAnimator transitions={{ entering: 'intro' }} continuous />

            <Animated
                className="arwes-card"
                style={{
                    position: 'relative',
                    display: 'inline-block',
                    maxWidth: '400px',
                    margin: '16px',
                    padding: '20px',
                    textAlign: 'left',
                    cursor: hover ? 'pointer' : 'default',
                    ...style,
                }}
                animated={[fade()]}
                onClick={() => {
                    if (hover) {
                        bleeps.click?.play();
                    }
                }}
            >
                <style>{`
                    .arwes-card .arwes-react-frames-framesvg [data-name=bg] {
                        color: rgba(33, 128, 141, 0.1);
                    }
                    .arwes-card .arwes-react-frames-framesvg [data-name=line] {
                        color: rgb(33, 128, 141);
                    }
                    .arwes-card:hover .arwes-react-frames-framesvg [data-name=bg] {
                        color: rgba(33, 128, 141, ${hover ? '0.2' : '0.1'});
                    }
                `}</style>

                <Animator>
                    <ArwesFrameCorners strokeWidth={2} />
                </Animator>

                {image && (
                    <Animator>
                        <Animated
                            as="img"
                            src={image.src}
                            animated={[fade()]}
                            style={{
                                width: '100%',
                                height: 'auto',
                                marginBottom: '16px',
                                display: 'block',
                            }}
                        />
                    </Animator>
                )}

                {title && (
                    <Animator>
                        <ArwesText as="h2" style={{ margin: '0 0 12px 0' }}>
                            {title}
                        </ArwesText>
                    </Animator>
                )}

                <Animator>
                    <ArwesText as="div">{children}</ArwesText>
                </Animator>

                {options && (
                    <Animator>
                        <div
                            style={{
                                marginTop: '16px',
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '8px',
                            }}
                        >
                            {options}
                        </div>
                    </Animator>
                )}
            </Animated>
        </Animator>
    );
};

// ============================================================================
// FrameCorners Component
// ============================================================================

interface FrameCornersProps {
    children?: ReactNode;
    palette?: PaletteType;
    style?: CSSProperties;
}

export const FrameCorners: React.FC<FrameCornersProps> = ({ children, palette = 'primary', style }) => {
    const color = paletteColors[palette];

    return (
        <div
            className={`arwes-frame-corners arwes-frame-corners--${palette}`}
            style={{
                position: 'relative',
                padding: '16px',
                ...style,
            }}
        >
            <style>{`
                .arwes-frame-corners--${palette} .arwes-react-frames-framesvg [data-name=line] {
                    color: ${color};
                }
                .arwes-frame-corners--${palette} .arwes-react-frames-framesvg [data-name=bg] {
                    color: transparent;
                }
            `}</style>

            <Animator>
                <ArwesFrameCorners strokeWidth={2} />
            </Animator>

            {children}
        </div>
    );
};

// ============================================================================
// Blockquote Component
// ============================================================================

interface BlockquoteProps {
    children?: ReactNode;
    style?: CSSProperties;
}

export const Blockquote: React.FC<BlockquoteProps> = ({ children, style }) => {
    return (
        <Animator merge combine manager="stagger">
            <Animated
                as="blockquote"
                className="arwes-blockquote"
                style={{
                    position: 'relative',
                    margin: '16px 0',
                    padding: '16px 16px 16px 24px',
                    borderLeft: '4px solid rgb(33, 128, 141)',
                    fontStyle: 'italic',
                    ...style,
                }}
                animated={[fade()]}
            >
                <ArwesText as="div">{children}</ArwesText>
            </Animated>
        </Animator>
    );
};

// ============================================================================
// Text Component
// ============================================================================

interface TextProps {
    children?: ReactNode;
    as?: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span' | 'div';
    style?: CSSProperties;
}

export const Text: React.FC<TextProps> = ({ children, as = 'p', style }) => {
    return (
        <ArwesText as={as} style={style}>
            {children}
        </ArwesText>
    );
};

// ============================================================================
// Theme Providers
// ============================================================================

interface ArwesThemeProviderProps {
    children: ReactNode;
}

export const ArwesThemeProvider: React.FC<ArwesThemeProviderProps> = ({ children }) => {
    return <>{children}</>;
};

interface StylesBaselineProps {
    styles?: Record<string, CSSProperties>;
}

export const StylesBaseline: React.FC<StylesBaselineProps> = ({ styles }) => {
    const customStyles: Record<string, CSSObject> = {
        ...stylesBaseline,
        body: {
            ...stylesBaseline.body,
            ...(styles?.body as CSSObject),
        },
    };

    return <Global styles={customStyles} />;
};

// ============================================================================
// Animation Provider
// ============================================================================

interface AnimatorGeneralProviderProps {
    children: ReactNode;
    animator?: {
        duration?: {
            enter?: number;
            exit?: number;
            stagger?: number;
        };
    };
}

export const AnimatorGeneralProvider: React.FC<AnimatorGeneralProviderProps> = ({ children, animator }) => {
    // Convert milliseconds to seconds for new API
    const duration = animator?.duration
        ? {
              enter: (animator.duration.enter ?? 200) / 1000,
              exit: (animator.duration.exit ?? 200) / 1000,
              stagger: (animator.duration.stagger ?? 40) / 1000,
          }
        : {
              enter: 0.2,
              exit: 0.2,
              stagger: 0.04,
          };

    return <ArwesAnimatorGeneralProvider duration={duration}>{children}</ArwesAnimatorGeneralProvider>;
};

// ============================================================================
// Bleeps Provider
// ============================================================================

interface BleepsProviderProps {
    children: ReactNode;
    audioSettings?: {
        common?: {
            volume?: number;
        };
    };
    playersSettings?: Record<
        string,
        {
            src?: string[];
            loop?: boolean;
        }
    >;
    bleepsSettings?: Record<
        string,
        {
            player?: string;
        }
    >;
}

export const BleepsProvider: React.FC<BleepsProviderProps> = ({
    children,
    audioSettings,
    playersSettings,
    bleepsSettings,
}) => {
    // Convert old API to new API
    const masterVolume = audioSettings?.common?.volume ?? 0.25;

    const bleeps: Record<string, { sources: Array<{ src: string; type: string }> }> = {};

    // Map players and bleeps
    if (playersSettings && bleepsSettings) {
        Object.entries(bleepsSettings).forEach(([bleepName, bleepConfig]) => {
            const playerName = bleepConfig.player;
            if (playerName && playersSettings[playerName]) {
                const playerSrc = playersSettings[playerName].src?.[0];
                if (playerSrc) {
                    bleeps[bleepName] = {
                        sources: [
                            {
                                src: playerSrc,
                                type: playerSrc.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
                            },
                        ],
                    };
                }
            }
        });
    }

    const settings = {
        master: { volume: masterVolume },
        bleeps,
    };

    return <ArwesBleepsProvider {...settings}>{children}</ArwesBleepsProvider>;
};
