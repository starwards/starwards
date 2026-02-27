/**
 * Arwes Compatibility Layer
 *
 * Wraps @arwes/react (1.0.0-next) primitives to provide alpha.19 API compatibility
 * with visual style matching Arwes Next Documentation exactly.
 */

import {
    Animated,
    Animator,
    AnimatorGeneralProvider as ArwesAnimatorGeneralProvider,
    BleepsProvider as ArwesBleepsProvider,
    FrameCorners as ArwesFrameCorners,
    Text as ArwesText,
    BleepsOnAnimator,
    FrameNefrex,
    FrameOctagon,
    Illuminator,
    fade,
    styleFrameClipOctagon,
    useBleeps,
    useFrameAssembler,
} from '@arwes/react';
import { type CSSObject, Global } from '@emotion/react';
import React, { type CSSProperties, type ReactNode, useRef } from 'react';

// eslint-disable-next-line sort-imports -- type imports sorted after values
import { hsl, paletteColors, type PaletteType, withAlpha } from '../colors';

// ============================================================================
// Theme - Using centralized colors from colors.ts
// ============================================================================

const theme = {
    colors: {
        background: hsl.background,
        primary: hsl.primary,
    },
    space: (index: number) => `${index * 0.25}rem`,
    spacen: (index: number) => index * 4,
};

const stylesBaseline: Record<string, CSSObject> = {
    '*, *::before, *::after': {
        boxSizing: 'border-box',
    },
    body: {
        margin: 0,
        padding: 0,
        backgroundColor: theme.colors.background,
        color: theme.colors.primary.main(3),
        fontFamily: '"Titillium Web", sans-serif',
        scrollbarColor: `${theme.colors.primary.main(7)} ${theme.colors.background}`,
    },
};

// ============================================================================
// Button Component
// ============================================================================

interface ButtonProps {
    children?: ReactNode;
    onClick?: () => void;
    palette?: PaletteType;
    disabled?: boolean;
    active?: boolean;
    layer?: PaletteType;
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
    const frameRef = useRef<SVGSVGElement>(null);
    useFrameAssembler(frameRef);

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
                    padding: '10px 24px',
                    background: 'transparent',
                    border: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    color: active ? '#fff' : color,
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    transition: 'all 0.2s ease-out',
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
                    .arwes-button--${colorKey} .arwes-frames-frame [data-name=bg] {
                        fill: ${withAlpha(theme.colors.primary.main(9), 0.4)};
                        stroke: ${theme.colors.primary.main(5)};
                        stroke-width: 1;
                        transition: all 0.2s ease-out;
                    }
                    .arwes-button--${colorKey} .arwes-frames-frame [data-name=line] {
                        stroke: ${theme.colors.primary.main(5)};
                        fill: none;
                        stroke-width: 2;
                        transition: all 0.2s ease-out;
                    }
                    .arwes-button--${colorKey}:hover:not(:disabled) .arwes-frames-frame [data-name=line] {
                        stroke: ${theme.colors.primary.high(2)};
                        filter: drop-shadow(0 0 4px ${theme.colors.primary.main(3)});
                    }
                    .arwes-button--${colorKey}:hover:not(:disabled) .arwes-frames-frame [data-name=bg] {
                        fill: ${withAlpha(theme.colors.primary.main(7), 0.5)};
                    }
                `}</style>

                <Animator>
                    <FrameOctagon
                        elementRef={frameRef}
                        strokeWidth={2}
                        squareSize={10}
                        styled={false}
                        animated={false}
                    />
                </Animator>

                <Animator>
                    <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
                </Animator>
            </Animated>
        </Animator>
    );
};

// ============================================================================
// Card Component - Matching Arwes Next Documentation Exactly
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
    const frameRef = useRef<SVGSVGElement>(null);
    useFrameAssembler(frameRef);

    const w = 400;

    return (
        <Animator merge combine manager="stagger">
            <BleepsOnAnimator transitions={{ entering: 'intro' }} continuous />

            <Animated
                as="article"
                className="arwes-card group"
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: `${w}px`,
                    margin: '16px',
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
                {/* Frame - Matching exact Arwes Next Card.tsx */}
                <Animator>
                    <FrameNefrex
                        elementRef={frameRef}
                        className="arwes-card-frame"
                        strokeWidth={4}
                        styled={false}
                        animated={false}
                    />
                </Animator>

                {/* SVG Style Overrides - Matching Card.module.css */}
                <style>{`
                    .arwes-card .arwes-card-frame {
                        position: absolute;
                        inset: 0;
                        z-index: 0;
                        opacity: 0.7;
                        transition: all 0.2s ease-out;
                    }
                    .arwes-card:hover .arwes-card-frame {
                        opacity: 1;
                    }
                    .arwes-card .arwes-frames-frame [data-name=bg] {
                        fill: ${withAlpha(theme.colors.primary.main(7), 0.25)};
                        stroke: ${withAlpha(theme.colors.primary.main(7), 0.5)};
                        stroke-width: 1;
                    }
                    .arwes-card .arwes-frames-frame [data-name=line] {
                        stroke: ${theme.colors.primary.main(7)};
                        fill: none;
                        stroke-width: 4;
                    }
                    .arwes-card:hover .arwes-frames-frame [data-name=line] {
                        stroke: ${theme.colors.primary.high(2)};
                        filter: drop-shadow(0 0 6px ${theme.colors.primary.main(3)});
                    }
                `}</style>

                {/* Markers - Matching Card.tsx */}
                <Animated
                    className="arwes-card-markers"
                    style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        lineHeight: 1,
                        color: withAlpha(theme.colors.primary.main(3), 0.2),
                    }}
                >
                    <div style={{ position: 'absolute', right: 8, top: 8 }}>⎯ 0x1010</div>
                    <div style={{ position: 'absolute', left: 8, bottom: 8 }}>0x1010 ⎯</div>
                </Animated>

                {/* Illuminator Effect */}
                <Illuminator
                    color={withAlpha(theme.colors.primary.main(7), 0.1)}
                    size={theme.spacen(100)}
                    style={{
                        position: 'absolute',
                        inset: 2,
                        width: 'calc(100% - 4px)',
                        height: 'calc(100% - 4px)',
                        clipPath: styleFrameClipOctagon({
                            leftBottom: false,
                            rightTop: false,
                            squareSize: theme.space(4),
                        }),
                        pointerEvents: 'none',
                    }}
                />

                {/* Content Container */}
                <div
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        padding: '24px 32px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}
                >
                    {image && (
                        <Animator>
                            <Animated
                                as="img"
                                src={image.src}
                                animated={[fade()]}
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    display: 'block',
                                    border: `1px solid ${theme.colors.primary.main(7)}`,
                                    opacity: 0.9,
                                }}
                            />
                        </Animator>
                    )}

                    {title && (
                        <Animator>
                            <ArwesText
                                as="h2"
                                className="arwes-card-title"
                                style={{
                                    position: 'relative',
                                    margin: 0,
                                    fontSize: '1.25rem',
                                    color: theme.colors.primary.main(3),
                                    transition: 'all 0.2s ease-out',
                                }}
                            >
                                {/* Hover indicator bar */}
                                <div
                                    className="arwes-card-title-bar"
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: '0.25rem',
                                        bottom: '0.25rem',
                                        width: '4px',
                                        backgroundColor: 'currentcolor',
                                        transition: 'all 0.2s ease-out',
                                        transformOrigin: 'left',
                                        transform: 'scaleX(0)',
                                    }}
                                />
                                <span
                                    className="arwes-card-title-text"
                                    style={{
                                        display: 'block',
                                        transition: 'all 0.2s ease-out',
                                    }}
                                >
                                    {title}
                                </span>
                            </ArwesText>
                            <style>{`
                                .arwes-card:hover .arwes-card-title {
                                    color: ${theme.colors.primary.high(2)};
                                }
                                .arwes-card:hover .arwes-card-title-bar {
                                    transform: scaleX(1);
                                }
                                .arwes-card:hover .arwes-card-title-text {
                                    transform: translateX(16px);
                                }
                            `}</style>
                        </Animator>
                    )}

                    <Animator>
                        <div
                            style={{
                                color: theme.colors.primary.main(5),
                                lineHeight: 1.6,
                                transition: 'all 0.2s ease-out',
                            }}
                        >
                            {children}
                        </div>
                        <style>{`
                            .arwes-card:hover > div > div:last-child > div {
                                color: ${theme.colors.primary.high(4)};
                            }
                        `}</style>
                    </Animator>

                    {options && (
                        <Animator>
                            <div
                                style={{
                                    paddingTop: '16px',
                                    borderTop: `1px solid ${theme.colors.primary.main(7)}`,
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                }}
                            >
                                {options}
                            </div>
                        </Animator>
                    )}
                </div>
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
                .arwes-frame-corners--${palette} .arwes-frames-frame [data-name=line] {
                    stroke: ${color};
                    fill: none;
                }
                .arwes-frame-corners--${palette} .arwes-frames-frame [data-name=bg] {
                    fill: transparent;
                }
            `}</style>

            <Animator>
                <ArwesFrameCorners strokeWidth={2} styled={false} />
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
                    borderLeft: `4px solid ${theme.colors.primary.main(3)}`,
                    background: withAlpha(theme.colors.primary.main(10), 0.5),
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
    const masterVolume = audioSettings?.common?.volume ?? 0.25;

    const bleeps: Record<string, { sources: Array<{ src: string; type: string }> }> = {};

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
