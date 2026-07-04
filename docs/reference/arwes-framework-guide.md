# ARWES Framework - Complete Developer & Designer Guide

## Framework Overview

**ARWES** is a low-to-medium level API web framework designed to build futuristic science fiction user interfaces with advanced animations, sound effects, and visual effects. Unlike out-of-the-box UI toolkits (MUI, Radix, Bootstrap), ARWES provides primitives, utilities, and base components to build custom design systems.

### Key Characteristics
- **Design Philosophy**: Opinionated sci-fi aesthetics inspired by Cyberprep, Synthwave, and productions like Star Citizen, Halo, TRON: Legacy, NIKKE, and Mecha Break
- **Target Audience**: Applications requiring futuristic, game-like interfaces with rich animations and sound effects
- **Flexibility**: Intended to be used alongside other animation libraries (GSAP, Framer Motion, Anime.js) and styling solutions (Emotion, Tailwind, MUI)
- **Performance**: Uses Motion One for animations (lightweight and performant)

---

## Installation & Setup

### React 18 Installation

```bash
# Install ARWES for React
npm install @arwes/react@1.0.0-next.25020502

# Install Emotion for styling (recommended)
npm install @emotion/react
```

### Next.js Configuration

**Critical**: Disable React strict mode in `next.config.js`:

```javascript
// next.config.js
module.exports = {
  reactStrictMode: false
};
```

### Legacy Version Notes
- **v1.0.0-alpha.5** (Feb 2018): Deprecated, documentation at version1-breakpoint1.arwes.dev
- **v1.0.0-alpha.19** (Apr 2021): Deprecated, documentation at version1-breakpoint2.arwes.dev
- **Current**: v1.0.0-next.25020502 - the `next`-branch pre-release this project pins

---

## Package Architecture

ARWES is organized into **vanilla** (framework-agnostic) and **implementation** (React-specific) packages.

### Vanilla Packages (Framework-Agnostic)

| Package | Status | Description |
|---------|--------|-------------|
| `@arwes/tools` | Polishing | General browser API tools |
| `@arwes/theme` | Development | Color, units, dynamic theming tools |
| `@arwes/animated` | Polishing | HTML element animation utilities |
| `@arwes/animator` | Polishing | Animation controls system |
| `@arwes/bleeps` | Polishing | Interactive sound effects manager |
| `@arwes/text` | Polishing | Text rendering effects |
| `@arwes/frames` | Polishing | Responsive vector graphics components |
| `@arwes/bgs` | Development | Passive UI background effects |
| `@arwes/core` | Development | Core UI functionalities |
| `arwes` | Polishing | All vanilla packages bundle |

### React Packages

| Package | Status | Description |
|---------|--------|-------------|
| `@arwes/react-tools` | Polishing | General React API tools |
| `@arwes/react-animator` | Polishing | Animator interface tools |
| `@arwes/react-animated` | Polishing | Animated UI elements |
| `@arwes/react-bleeps` | Polishing | Sound effects manager |
| `@arwes/react-text` | Polishing | Text effect components |
| `@arwes/react-frames` | Polishing | Vector graphics components |
| `@arwes/react-bgs` | Polishing | Background effects |
| `@arwes/react-core` | Specification | Core UI components |
| `@arwes/react` | Polishing | All packages bundle |

**Note**: `@arwes/react` re-exports all vanilla and React-specific packages.

---

## Core Fundamentals

## 1. Theme System

### Creating a Theme

```typescript
import { type CSSObject, Global } from '@emotion/react';
import { createAppTheme, createAppStylesBaseline } from '@arwes/react';

const theme = createAppTheme();
const stylesBaseline = createAppStylesBaseline(theme);

const App = (): ReactElement => {
  return (
    <>
      <Global styles={stylesBaseline as Record<string, CSSObject>} />
      {/* App content */}
    </>
  );
};
```

### Theme Structure

The theme provides:
- **Color system**: Primary, secondary, tertiary colors with opacity functions
- **Spacing units**: Consistent spacing scale
- **Typography**: Font families, sizes, weights, line heights
- **Breakpoints**: Responsive design breakpoints
- **Transitions**: Animation timing functions
- **Shadows**: Depth and elevation effects
- **Border radius**: Corner rounding standards

### Accessing Theme Colors

```typescript
theme.colors.primary.bg(1)    // Background color with opacity level
theme.colors.primary.deco(0)  // Decorative color
theme.colors.primary.main(4)  // Main color with intensity level
```

---

## 2. Animator System

The **Animator System** is a tree of animator nodes (Directed Acyclic Graph) that orchestrates UI element transitions.

### Animator States (Finite State Machine)

1. **Exited**: Elements invisible/unavailable (default state)
2. **Entering**: Elements transitioning into the app
3. **Entered**: Elements visible/available to user
4. **Exiting**: Elements transitioning out of the app

### Animator Transitions

- **Enter**: `exited/exiting` → `entering` → `entered`
- **Exit**: `entered/entering` → `exiting` → `exited`

### Core Concepts

- **Cascade Effect**: Parent enters → triggers children to enter
- **Manager**: Controls how children transition (parallel, sequence, stagger)
- **Combine**: Merges children into one for complex effects
- **Dynamic Duration**: Text animations calculate duration based on content length

### Basic Setup

```typescript
import { 
  AnimatorGeneralProvider, 
  Animator,
  type AnimatorGeneralProviderSettings 
} from '@arwes/react';

const animatorsSettings: AnimatorGeneralProviderSettings = {
  duration: {
    enter: 0.2,   // seconds
    exit: 0.2,
    stagger: 0.04
  }
};

const App = (): ReactElement => {
  const [active] = useState(true);
  
  return (
    <AnimatorGeneralProvider {...animatorsSettings}>
      <Animator combine manager='stagger' active={active}>
        {/* Child components */}
      </Animator>
    </AnimatorGeneralProvider>
  );
};
```

### Animator Props

- `active`: Boolean to trigger enter/exit transitions
- `manager`: How to transition children
  - `'parallel'` (default): All children at once
  - `'sequence'`: One after another
  - `'stagger'`: Offset by stagger duration
- `combine`: Merge all children into single animator
- `merge`: Merge with parent animator
- `duration`: Override global duration settings
  ```typescript
  duration={{ enter: 2, exit: 1 }}
  ```

### Nested Animators

```typescript
<Animator active={active}>
  <Background />
  <Animator manager='stagger'>
    <Card1 />
    <Card2 />
    <Card3 />
  </Animator>
</Animator>
```

---

## 3. Animated Component

The `<Animated>` component wraps HTML elements with animation capabilities.

### Basic Usage

```typescript
import { Animator, Animated, fade } from '@arwes/react';

<Animator>
  <Animated
    className='my-element'
    style={{ padding: '20px' }}
    animated={[
      fade(),                   // Fade in/out
      ['y', '2rem', 0]          // Slide up from 2rem to 0
    ]}
  >
    Content
  </Animated>
</Animator>
```

### Animation Helpers

- `fade()`: Opacity fade in/out (also `flicker()`, or string presets `'fade' | 'flicker' | 'draw'`)
- `[property, from, to]`: Animate a CSS property (tuple transition)
  - `['x', '-100%', 0]`: Slide from left
  - `['y', '2rem', 0]`: Slide from bottom
  - `['scale', 0.8, 1]`: Scale up
  - `['rotate', 10, 0]`: Rotate

### Advanced Example

```typescript
<Animated
  as='button'
  className='sci-fi-button'
  animated={[
    fade(),
    ['y', '20px', 0],
    ['scale', 0.95, 1]
  ]}
  onClick={() => bleeps.click?.play()}
>
  Launch
</Animated>
```

---

## 4. Sound System (Bleeps)

**Bleeps** are short interactive sound effects for UI events, transitions, and interactions.

### BleepsProvider Setup

```typescript
import { BleepsProvider, type BleepsProviderSettings } from '@arwes/react';

const bleepsSettings: BleepsProviderSettings = {
  master: {
    volume: 0.9
  },
  bleeps: {
    intro: {
      sources: [
        { 
          src: 'https://arwes.dev/assets/sounds/intro.mp3', 
          type: 'audio/mpeg' 
        }
      ]
    },
    click: {
      sources: [
        { 
          src: 'https://arwes.dev/assets/sounds/click.mp3', 
          type: 'audio/mpeg' 
        }
      ]
    }
  }
};

const App = (): ReactElement => {
  return (
    <BleepsProvider {...bleepsSettings}>
      {/* App content */}
    </BleepsProvider>
  );
};
```

### Using Bleeps in Components

```typescript
import { useBleeps } from '@arwes/react';

const MyComponent = () => {
  const bleeps = useBleeps();
  
  return (
    <button onClick={() => bleeps.click?.play()}>
      Click Me
    </button>
  );
};
```

### BleepsOnAnimator

Automatically play bleeps on animator state transitions:

```typescript
import { BleepsOnAnimator } from '@arwes/react';

<Animator>
  <BleepsOnAnimator 
    transitions={{ 
      entering: 'intro',   // Play 'intro' bleep when entering
      exiting: 'outro'     // Play 'outro' bleep when exiting
    }} 
    continuous  // Keep playing during entire transition
  />
  <YourComponent />
</Animator>
```

### Sound Best Practices

- Use short sounds (< 1 second) for UI feedback
- Recommended sound types:
  - **Beeps/Bleeps**: Button clicks, toggles
  - **Processing loops**: Loading states
  - **Glitches**: Error states
  - **Chimes**: Success notifications
- Respect accessibility: Check `prefers-reduced-motion`
- Provide volume controls for users
- Avoid playing sounds on every animation (can be overwhelming)

---

## 5. Text Animations

The `<Text>` component provides dynamic text rendering effects.

### Basic Text

```typescript
import { Animator, Text } from '@arwes/react';

<Animator>
  <Text>
    Text content.
  </Text>
</Animator>
```

### Text with Nested HTML

```typescript
<Animator duration={{ enter: 2 }}>
  <Text
    as='div'  // Default is 'p'
    manager='sequence'
    contentStyle={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    }}
  >
    <h3>Nebula</h3>
    <p>A <b>nebula</b> is a cloud of gas and dust in space...</p>
    <p>Nebulae are often star-forming regions...</p>
  </Text>
</Animator>
```

### Decipher Animation

```typescript
<Animator duration={{ enter: 1, exit: 1 }}>
  <Text 
    className='text-decipher' 
    manager='decipher' 
    fixed
  >
    Pillars of Creation
  </Text>
</Animator>
```

### Text Manager Options

- `'sequence'` (default): Characters appear sequentially
- `'decipher'`: All characters appear at once, morphing from random characters

### Dynamic Duration

Text animations automatically calculate duration based on content length. The `duration` prop sets the maximum duration.

### Best Practices

- Animate only important text (titles, headings)
- Use `decipher` for short, centered, or monospace text
- Avoid animating long paragraphs (poor UX)
- Nested HTML with CSS transitions may interfere

---

## 6. Frame System (SVG Graphics)

ARWES Frames creates responsive, dynamic SVG decorative elements.

### FrameSVGCorners

```typescript
import { Animator, FrameSVGCorners } from '@arwes/react';

<Animator>
  <div style={{ position: 'relative', padding: '20px' }}>
    <FrameSVGCorners strokeWidth={2} />
    <div>Content with corner decorations</div>
  </div>
</Animator>
```

### Frame Path Syntax

Frames use a custom path definition system:

```typescript
{
  type: 'path',
  name: 'line',          // data-name attribute
  className: 'my-line',  // class attribute
  style: {               // CSS properties
    stroke: '#20DFDF',
    fill: 'none'
  },
  path: [
    ['M', 0.5, 1],           // Move to x, y
    ['H', '100% - 0.5'],     // Horizontal line (responsive)
    ['v', 21]                // Vertical line (relative, lowercase)
  ]
}
```

### Responsive Units

- Absolute: `['M', 10, 20]` - 10px, 20px
- Percentage: `['H', '100%']` - Full width
- Calculated: `['H', '100% - 0.5']` - Width minus 0.5px
- Relative: `['v', 21]` (lowercase) - 21px from previous point

### Custom Frame Example

```typescript
const customFrame = [
  {
    type: 'path',
    style: { fill: 'none', stroke: '#20DFDF' },
    path: [
      ['M', 0.5, 1],
      ['H', '100% - 0.5'],
      ['v', 21]
    ]
  },
  {
    type: 'rect',
    style: { 
      fill: 'hsl(180deg 75% 50% / 10%)',
      stroke: 'none' 
    },
    x: 6,
    y: 6,
    width: '100% - 12',
    height: '100% - 12'
  }
];
```

### Frame Colors via CSS

```typescript
<Animated className='card'>
  <style>{`
    .card .arwes-react-frames-framesvg [data-name=bg] {
      color: ${theme.colors.primary.deco(1)};
    }
    .card .arwes-react-frames-framesvg [data-name=line] {
      color: ${theme.colors.primary.main(4)};
    }
  `}</style>
  <FrameSVGCorners strokeWidth={2} />
</Animated>
```

---

## 7. Background Effects

ARWES provides passive animated background effects.

### Available Effects

```typescript
import { GridLines, Dots, MovingLines } from '@arwes/react';

const Background = (): ReactElement => {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: theme.colors.primary.bg(1)
    }}>
      <GridLines lineColor={theme.colors.primary.deco(0)} />
      <Dots color={theme.colors.primary.deco(1)} />
      <MovingLines lineColor={theme.colors.primary.deco(2)} />
    </div>
  );
};
```

### Background Integration

```typescript
const App = (): ReactElement => {
  return (
    <Animator active={active}>
      <Background />
      <Animator manager='stagger'>
        {/* Foreground content */}
      </Animator>
    </Animator>
  );
};
```

---

## Complete Application Example

### Full Setup with All Systems

```typescript
import React, { type ReactElement, useState } from 'react';
import { type CSSObject, Global } from '@emotion/react';
import {
  createAppTheme,
  createAppStylesBaseline,
  AnimatorGeneralProvider,
  BleepsProvider,
  Animator,
  Animated,
  FrameSVGCorners,
  Text,
  GridLines,
  Dots,
  useBleeps,
  BleepsOnAnimator,
  fade,
  type AnimatorGeneralProviderSettings,
  type BleepsProviderSettings
} from '@arwes/react';

// Theme setup
const theme = createAppTheme();
const stylesBaseline = createAppStylesBaseline(theme);

// Animator settings
const animatorsSettings: AnimatorGeneralProviderSettings = {
  duration: {
    enter: 0.2,
    exit: 0.2,
    stagger: 0.04
  }
};

// Bleeps settings
const bleepsSettings: BleepsProviderSettings = {
  master: { volume: 0.9 },
  bleeps: {
    intro: {
      sources: [{ 
        src: 'https://arwes.dev/assets/sounds/intro.mp3',
        type: 'audio/mpeg' 
      }]
    },
    click: {
      sources: [{ 
        src: 'https://arwes.dev/assets/sounds/click.mp3',
        type: 'audio/mpeg' 
      }]
    }
  }
};

// Background component
const Background = (): ReactElement => (
  <div style={{
    position: 'absolute',
    inset: 0,
    backgroundColor: theme.colors.primary.bg(1)
  }}>
    <GridLines lineColor={theme.colors.primary.deco(0)} />
    <Dots color={theme.colors.primary.deco(1)} />
  </div>
);

// Card component
const Card = (): ReactElement => {
  const bleeps = useBleeps();
  
  return (
    <Animator merge combine manager='stagger'>
      <BleepsOnAnimator 
        transitions={{ entering: 'intro' }} 
        continuous 
      />
      
      <Animated
        className='card'
        style={{
          position: 'relative',
          display: 'block',
          maxWidth: '300px',
          margin: theme.space([4, 'auto']),
          padding: theme.space(8),
          textAlign: 'center'
        }}
        animated={[fade(), ['y', '2rem', 0]]}
        onClick={() => bleeps.click?.play()}
      >
        <style>{`
          .card .arwes-react-frames-framesvg [data-name=bg] {
            color: ${theme.colors.primary.deco(1)};
          }
          .card .arwes-react-frames-framesvg [data-name=line] {
            color: ${theme.colors.primary.main(4)};
          }
        `}</style>
        
        <Animator>
          <FrameSVGCorners strokeWidth={2} />
        </Animator>
        
        <Animator>
          <Text as='h1'>
            Arwes Project
          </Text>
        </Animator>
        
        <Animator>
          <Text>
            Futuristic science fiction user interface web framework.
          </Text>
        </Animator>
      </Animated>
    </Animator>
  );
};

// Main App
const App = (): ReactElement => {
  const [active] = useState(true);
  
  return (
    <>
      <Global styles={stylesBaseline as Record<string, CSSObject>} />
      
      <AnimatorGeneralProvider {...animatorsSettings}>
        <BleepsProvider {...bleepsSettings}>
          <Animator combine manager='stagger' active={active}>
            <Background />
            <Animator>
              <Card />
            </Animator>
          </Animator>
        </BleepsProvider>
      </AnimatorGeneralProvider>
    </>
  );
};

export default App;
```

---

## Advanced Patterns

### Subsystems

Applications typically have a main animator system with nested subsystems:

```typescript
<Animator active={mainActive}>
  <Header />
  <Animator active={sidebarActive}>
    <Sidebar />
  </Animator>
  <Animator active={contentActive}>
    <Content />
  </Animator>
  <Footer />
</Animator>
```

### Conditional Rendering

```typescript
const [show, setShow] = useState(false);

<Animator active={show}>
  {show && <Modal />}
</Animator>
```

### Route Transitions

```typescript
const location = useLocation();

<Animator key={location.pathname} active={true}>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/about" element={<About />} />
  </Routes>
</Animator>
```

---

## Performance Optimization

### Animation Best Practices

1. **CSS Properties**: Prioritize `opacity`, `transform`, `filter` for animations
2. **GPU Acceleration**: Use `transform: translate3d()` over `top`/`left`
3. **Limit Concurrent Animations**: Don't animate everything at once
4. **Mobile Considerations**: Reduce animation complexity on mobile
5. **Use `will-change`**: For frequently animated properties

```css
.animated-element {
  will-change: transform, opacity;
}
```

### Animator Optimization

- Use `merge` prop to avoid creating unnecessary animator nodes
- Use `combine` for complex coordinated animations
- Disable animations for offscreen content
- Consider `prefers-reduced-motion` for accessibility

```typescript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

const animationDuration = prefersReducedMotion ? 0 : 0.2;
```

---

## Accessibility Guidelines

### Motion Considerations

Always respect user preferences:

```typescript
import { useEffect, useState } from 'react';

const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  return prefersReducedMotion;
};

// Usage
const App = () => {
  const reducedMotion = useReducedMotion();
  
  const animatorSettings = {
    duration: {
      enter: reducedMotion ? 0 : 0.2,
      exit: reducedMotion ? 0 : 0.2,
      stagger: reducedMotion ? 0 : 0.04
    }
  };
  
  return (
    <AnimatorGeneralProvider {...animatorSettings}>
      {/* App */}
    </AnimatorGeneralProvider>
  );
};
```

### Sound Accessibility

- Provide mute/volume controls
- Don't rely solely on sound for feedback
- Consider sound fatigue (too many sounds)
- Test with screen readers

---

## TypeScript Support

ARWES provides strict TypeScript v5+ definitions.

### Type Imports

```typescript
import type {
  AnimatorRef,
  AnimatorGeneralProviderSettings,
  BleepsProviderSettings,
  BleepsManager
} from '@arwes/react';
```

### Component Props Types

```typescript
import type { ReactElement } from 'react';
import type { AnimatorRef } from '@arwes/react';

interface MyComponentProps {
  animator?: AnimatorRef;
  title: string;
  onAction?: () => void;
}

const MyComponent = ({ 
  animator, 
  title, 
  onAction 
}: MyComponentProps): ReactElement => {
  // Component logic
};
```

---

## Common Patterns & Recipes

### Loading Indicator

```typescript
const LoadingIndicator = (): ReactElement => {
  return (
    <Animator active={true}>
      <Animated
        style={{
          width: '50px',
          height: '50px',
          border: '3px solid',
          borderColor: theme.colors.primary.main(4),
          borderTopColor: 'transparent',
          borderRadius: '50%'
        }}
        animated={[
          ['rotate', 0, 360]
        ]}
      >
      </Animated>
    </Animator>
  );
};
```

### Modal with Enter/Exit

```typescript
const Modal = ({ isOpen, onClose }: ModalProps): ReactElement => {
  return (
    <Animator active={isOpen}>
      {isOpen && (
        <Animated
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          animated={[fade()]}
          onClick={onClose}
        >
          <Animator>
            <Animated
              style={{
                background: theme.colors.primary.bg(2),
                padding: theme.space(8),
                borderRadius: '8px',
                position: 'relative'
              }}
              animated={[
                fade(),
                ['scale', 0.9, 1],
                ['y', '20px', 0]
              ]}
              onClick={(e) => e.stopPropagation()}
            >
              <FrameSVGCorners strokeWidth={2} />
              <Text as='h2'>Modal Title</Text>
              <Text>Modal content...</Text>
            </Animated>
          </Animator>
        </Animated>
      )}
    </Animator>
  );
};
```

### Button Component

```typescript
const Button = ({ 
  children, 
  onClick 
}: ButtonProps): ReactElement => {
  const bleeps = useBleeps();
  
  return (
    <Animator>
      <Animated
        as='button'
        style={{
          padding: theme.space([2, 4]),
          background: theme.colors.primary.main(4),
          color: theme.colors.primary.text(1),
          border: 'none',
          cursor: 'pointer',
          position: 'relative'
        }}
        animated={[
          fade(),
          ['scale', 0.95, 1]
        ]}
        onClick={(e) => {
          bleeps.click?.play();
          onClick?.(e);
        }}
      >
        {children}
      </Animated>
    </Animator>
  );
};
```

---

## Troubleshooting

### Common Issues

**Animations not working**
- Check `reactStrictMode: false` in Next.js config
- Verify `AnimatorGeneralProvider` wraps components
- Ensure `active` prop is set on root Animator

**Sounds not playing**
- Check browser audio is unlocked (user interaction required)
- Verify `BleepsProvider` is configured
- Check audio file URLs are accessible
- Some browsers block audio until user interaction

**TypeScript errors**
- Install `@types/react@18` and `@types/react-dom@18`
- Ensure ARWES version is `1.0.0-alpha.23` or later

**Frame SVG not appearing**
- Check parent has `position: relative`
- Verify theme colors are defined
- Ensure `Animator` wraps `FrameSVG` component

---

## Resources

### Official Links
- **Documentation**: https://arwes.dev/docs
- **Next Version Docs**: https://next.arwes.dev/docs
- **Playground**: https://playground.arwes.dev
- **GitHub**: https://github.com/arwes/arwes
- **NPM**: https://www.npmjs.com/package/@arwes/react

### Community Examples
- CodeSandbox examples: https://codesandbox.io/examples/package/arwes
- GitHub examples: https://github.com/arwes/arwes/tree/next/apps

---

## Development Status

As of August 2023 (v1.0.0-alpha.23):
- **Polishing**: Most packages stable, minor refinements ongoing
- **Development**: Theme, bgs, core packages still in active development
- **Production Ready**: Not recommended for production yet (alpha stage)
- **API Changes**: Expect breaking changes between alpha releases

---

## Key Takeaways for LLM Agents

1. **Architecture**: Three-layer system (Theme + Animator + Bleeps)
2. **Animator-Centric**: Everything revolves around the animator tree
3. **Cascading**: Parent animators control children by default
4. **Sound Integration**: Bleeps tied to animator transitions
5. **Dynamic Calculations**: Text/complex animations calculate own durations
6. **Performance**: Use CSS transforms, respect `prefers-reduced-motion`
7. **Flexibility**: Intended to work alongside other libraries
8. **TypeScript**: Fully typed with strict definitions
9. **Customization**: Low-level primitives allow high customization
10. **Sci-Fi Focus**: Opinionated aesthetics inspired by specific media

When building with ARWES, think in terms of:
- **Animator trees** (structure)
- **State transitions** (behavior)
- **Visual effects** (frames, backgrounds)
- **Audio feedback** (bleeps)
- **Dynamic text** (effects)

The framework is best suited for applications that want to evoke futuristic, game-like, or sci-fi aesthetics with rich motion and sound.