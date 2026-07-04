# Arwes Integration Guide

Complete guide for integrating Arwes futuristic sci-fi UI framework into React applications.

**Note:** This project depends on `@arwes/react`, pinned to the `1.0.0-next.25020502` pre-release (see `modules/browser/package.json`). This pinned version peer-depends on React 18 (`peerDependencies: { "react": "18" }`), matching the project's `react@^18.3.1`; React 19 support is a separate, still-incomplete effort (the `@arwes-amir/react` fork). See [ARWES_VERSION_MIGRATION_GUIDE.md](./ARWES_VERSION_MIGRATION_GUIDE.md) and [CHANGES_SINCE_BLOG.md](./CHANGES_SINCE_BLOG.md) for fork details, or the fork repo https://github.com/amir-arad/arwes.

## Installation

### This Fork (React 19 Support)

```bash
# Main bundle (includes all packages)
npm install @arwes/react

# Or install individual packages
npm install @arwes/react-animator
npm install @arwes/react-animated
npm install @arwes/react-frames
npm install @arwes/react-bleeps
npm install @arwes/react-text
npm install @arwes/react-bgs
```

### Original Packages (React 18 only)

```bash
npm install @arwes/react
```

## Important Limitations

- **No React Strict Mode** - Arwes does not work with React strict mode
- **No React Server Components (RSC)** - Use client-side rendering only (`'use client'`)
- **React 18 Required** - This pinned version supports React 18

## Core Concepts

### 1. Animator System

Arwes uses a **finite state machine** with 4 states for orchestrating animations:

```
exited → entering → entered → exiting → exited
```

All animations are controlled through the `<Animator>` component which creates a node in an animation tree.

### 2. Component Hierarchy

```tsx
<Animator>           {/* Controls animation flow */}
  <Animated>         {/* Runs animations on state changes */}
    {/* Your content */}
  </Animated>
</Animator>
```

## Quick Start

### Basic Setup

```tsx
'use client' // Required for Next.js

import { Animator, Animated } from '@arwes/react'

function MyComponent() {
  return (
    <Animator duration={{ enter: 0.6, exit: 0.3 }}>
      <Animated
        as="div"
        animated={['fade']}
        style={{ padding: '2rem' }}
      >
        <h1>Futuristic UI</h1>
      </Animated>
    </Animator>
  )
}
```

### With Global Settings

```tsx
import { AnimatorGeneralProvider } from '@arwes/react'

function App() {
  return (
    <AnimatorGeneralProvider
      disabled={false}
      duration={{ enter: 0.4, exit: 0.4, stagger: 0.04 }}
    >
      {/* Your app components */}
    </AnimatorGeneralProvider>
  )
}
```

## Animation System

### Built-in Animations

```tsx
import { Animated } from '@arwes/react'

// Fade in/out
<Animated animated={['fade']} />

// Flicker effect
<Animated animated={['flicker']} />

// Custom transform
<Animated animated={[
  ['opacity', 0, 1],           // [property, fromValue, toValue]
  ['x', 20, 0],                // Translate X
  ['y', -10, 0],               // Translate Y
  ['rotate', -45, 0]           // Rotation in degrees
]} />
```

### Animation Timing

```tsx
// Set duration in Animator (applies to all children)
<Animator duration={{ enter: 0.7, exit: 0.3, delay: 0.25 }}>
  <Animated animated={['fade']} />
</Animator>

// Or set duration in Animated (overrides parent)
<Animator>
  <Animated
    animated={{
      transitions: {
        entering: {
          opacity: [0, 1],
          duration: 0.7,
          delay: 0.25
        },
        exiting: {
          opacity: [1, 0],
          duration: 0.3
        }
      }
    }}
  />
</Animator>
```

### Manager Strategies

Control how child animators are orchestrated:

```tsx
// All children animate together
<Animator manager="parallel">

// Children animate with delay between each
<Animator manager="stagger" duration={{ stagger: 0.1 }}>

// Children animate one after another
<Animator manager="sequence">

// Only one child animates at a time
<Animator manager="switch">
```

### Advanced Animation Functions

Use custom animation libraries like Motion One or GSAP:

```tsx
import { animate } from 'motion'

<Animated
  animated={{
    transitions: {
      entering: ({ element, duration }) =>
        animate(element, { opacity: [0, 1] }, { duration }),
      exiting: ({ element, duration }) =>
        animate(element, { opacity: [1, 0] }, { duration })
    }
  }}
/>
```

## Frame Components

Frames are responsive SVG borders and containers. All frames support:
- `positioned={false}` - Remove absolute positioning
- `styled={false}` - Remove default styles
- `animated={false}` - Disable animations

### Available Frames

```tsx
import {
  FrameCorners,
  FrameLines,
  FrameOctagon,
  FrameUnderline,
  FrameNero,
  FrameNefrex,
  FrameKranox,
  FrameHeader,
  FrameCircle
} from '@arwes/react'
```

### Basic Usage

```tsx
<div style={{ position: 'relative', width: 300, height: 200 }}>
  <FrameOctagon
    style={{
      '--arwes-frames-line-color': 'hsl(180deg 75% 50%)',
      '--arwes-frames-bg-color': 'hsl(180deg 75% 50% / 10%)'
    }}
    animated={false}
  />
  <div style={{ position: 'relative', padding: '1rem' }}>
    Panel Content
  </div>
</div>
```

### CSS Variables for Frames

```css
/* Line elements */
--arwes-frames-line-color: color;
--arwes-frames-line-filter: filter;

/* Background elements */
--arwes-frames-bg-color: color;
--arwes-frames-bg-stroke: color;
--arwes-frames-bg-filter: filter;

/* Decorative elements */
--arwes-frames-deco-color: color;
--arwes-frames-deco-filter: filter;
```

### Custom Frames with FrameBase

```tsx
import { FrameBase, type FrameSettings } from '@arwes/react'

const frameSettings: FrameSettings = {
  elements: [
    {
      type: 'path',
      name: 'line',
      style: { fill: 'none', stroke: '#20DFDF' },
      path: [
        ['M', 0.5, 1],              // Absolute position
        ['H', '100% - 0.5'],        // Responsive width
        ['v', 21]                   // Relative to previous point
      ]
    },
    {
      type: 'rect',
      style: { fill: 'hsl(180deg 75% 50% / 10%)', stroke: 'none' },
      x: 6,
      y: 6,
      width: '100% - 12',           // Responsive calculation
      height: '100% - 12'
    }
  ]
}

<div style={{ position: 'relative', width: 300, height: 300 }}>
  <FrameBase settings={frameSettings} />
  <div style={{ position: 'relative' }}>
    Custom Frame Content
  </div>
</div>
```

## Background Effects

All backgrounds use `position: absolute` by default to fill the parent container.

### Available Backgrounds

```tsx
import { Dots, Puffs, GridLines, MovingLines } from '@arwes/react'
```

### Dots Pattern

```tsx
<Animator>
  <Dots
    color="hsl(180deg 75% 50% / 0.5)"
    distance={30}
    size={1}
  />
  <div style={{ position: 'relative' }}>
    Content
  </div>
</Animator>
```

### Puffs (Particles)

```tsx
<Animator duration={{ enter: 1 }}>
  <Puffs
    color="hsl(60, 75%, 50%, 0.5)"
    quantity={100}
    padding={0}
    xOffset={[10, 50]}
    yOffset={[-20, -80]}
    radiusOffset={[4, 20]}
  />
  <div style={{ position: 'relative' }}>
    Content
  </div>
</Animator>
```

### GridLines

```tsx
<Animator>
  <GridLines
    lineColor="hsl(180deg 75% 50% / 0.2)"
    distance={40}
  />
  <div style={{ position: 'relative' }}>
    Content
  </div>
</Animator>
```

### MovingLines (Scan Effect)

```tsx
<Animator>
  <MovingLines
    lineColor="hsl(180deg 75% 50%)"
    distance={100}
    sets={3}
  />
  <div style={{ position: 'relative' }}>
    Scanning Effect
  </div>
</Animator>
```

## Text Effects

Text components animate character-by-character and work with the Animator system.

### Sequence (Typewriter Effect)

```tsx
import { Text } from '@arwes/react'

<Animator duration={{ enter: 2 }}>
  <Text
    as="div"
    manager="sequence"  // Default
    contentStyle={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
  >
    <h3>Title</h3>
    <p>A paragraph with <b>bold</b> text.</p>
    <p>Another paragraph with animations.</p>
  </Text>
</Animator>
```

### Decipher (Decryption Effect)

Best for short, centered, or monospace text:

```tsx
<Animator duration={{ enter: 1, exit: 1 }}>
  <Text
    manager="decipher"
    fixed  // Use animator's duration instead of calculating from text length
  >
    CLASSIFIED DATA
  </Text>
</Animator>
```

### Dynamic Duration

By default, `<Text>` calculates duration based on text length. Use `fixed={true}` to use the animator's duration instead:

```tsx
// Duration auto-calculated from text length
<Animator>
  <Text>Long text that will take longer to animate</Text>
</Animator>

// Fixed duration regardless of text length
<Animator duration={{ enter: 1 }}>
  <Text fixed>Any length text animates in 1 second</Text>
</Animator>
```

## Sound Effects (Bleeps)

### Type-Safe Setup

```tsx
// types.ts
export type BleepsNames = 'hover' | 'click' | 'type' | 'error'
```

### Provider Configuration

```tsx
import { BleepsProvider, type BleepsProviderSettings } from '@arwes/react'
import type { BleepsNames } from './types'

const bleepsSettings: BleepsProviderSettings<BleepsNames> = {
  master: {
    volume: 0.5  // 50% of OS volume
  },
  common: {
    disabled: false
  },
  categories: {
    background: { volume: 0.25 },
    transition: { volume: 0.5 },
    interaction: { volume: 0.75 },
    notification: { volume: 1 }
  },
  bleeps: {
    hover: {
      category: 'interaction',
      sources: [
        { src: '/sounds/hover.webm', type: 'audio/webm' },
        { src: '/sounds/hover.mp3', type: 'audio/mpeg' }  // Fallback
      ]
    },
    click: {
      category: 'interaction',
      sources: [
        { src: '/sounds/click.webm', type: 'audio/webm' },
        { src: '/sounds/click.mp3', type: 'audio/mpeg' }
      ]
    },
    type: {
      category: 'transition',
      sources: [
        { src: '/sounds/type.webm', type: 'audio/webm' },
        { src: '/sounds/type.mp3', type: 'audio/mpeg' }
      ],
      loop: true
    },
    error: {
      category: 'notification',
      sources: [
        { src: '/sounds/error.webm', type: 'audio/webm' },
        { src: '/sounds/error.mp3', type: 'audio/mpeg' }
      ]
    }
  }
}

function App() {
  return (
    <BleepsProvider {...bleepsSettings}>
      {/* Your app */}
    </BleepsProvider>
  )
}
```

### Using Bleeps

```tsx
import { useBleeps } from '@arwes/react'
import type { BleepsNames } from './types'

function Button() {
  const bleeps = useBleeps<BleepsNames>()

  return (
    <button
      onMouseEnter={() => bleeps.hover?.play()}
      onClick={() => bleeps.click?.play()}
    >
      Interactive Button
    </button>
  )
}
```

### Bleeps on Animator Events

```tsx
import { Animator, Text, BleepsOnAnimator } from '@arwes/react'
import type { BleepsNames } from './types'

<Animator>
  <BleepsOnAnimator<BleepsNames>
    transitions={{ entering: 'type', exiting: 'type' }}
    continuous={false}  // Set true for long sounds
  />
  <Text>
    Sound plays when animator enters and exits
  </Text>
</Animator>
```

## Complete Example: Spaceship Panel

```tsx
'use client'

import {
  Animator,
  Animated,
  FrameCorners,
  GridLines,
  Text,
  AnimatorGeneralProvider
} from '@arwes/react'

function SpaceshipPanel() {
  return (
    <AnimatorGeneralProvider duration={{ enter: 0.6, exit: 0.4 }}>
      <Animator manager="stagger" duration={{ stagger: 0.1 }}>
        {/* Navigation Panel */}
        <Animator>
          <Animated
            as="div"
            animated={['fade', ['y', -20, 0]]}
            style={{ position: 'relative', width: 300, height: 200 }}
          >
            <FrameCorners
              style={{
                '--arwes-frames-line-color': 'cyan',
                '--arwes-frames-bg-color': 'rgba(0, 255, 255, 0.1)'
              }}
            />
            <GridLines lineColor="rgba(0, 255, 255, 0.2)" />
            <div style={{ position: 'relative', padding: '1rem' }}>
              <Animator>
                <Text as="h3">NAVIGATION</Text>
              </Animator>
              <p>Coordinates: 47.12, -122.35</p>
            </div>
          </Animated>
        </Animator>

        {/* Power Panel */}
        <Animator>
          <Animated
            as="div"
            animated={['fade', ['x', 20, 0]]}
            style={{ position: 'relative', width: 300, height: 200 }}
          >
            <FrameCorners
              style={{
                '--arwes-frames-line-color': 'lime',
                '--arwes-frames-bg-color': 'rgba(0, 255, 0, 0.1)'
              }}
            />
            <div style={{ position: 'relative', padding: '1rem' }}>
              <Animator>
                <Text as="h3">POWER SYSTEMS</Text>
              </Animator>
              <p>Core Temperature: 2,847K</p>
              <p>Output: 847 MW</p>
            </div>
          </Animated>
        </Animator>
      </Animator>
    </AnimatorGeneralProvider>
  )
}

export default SpaceshipPanel
```

## Common Patterns

### Panel with Frame and Background

```tsx
<div style={{ position: 'relative', width: '100%', height: 400 }}>
  <Animator>
    <FrameOctagon
      style={{ '--arwes-frames-line-color': 'cyan' }}
    />
    <GridLines lineColor="rgba(0, 255, 255, 0.15)" />
    <MovingLines lineColor="cyan" sets={2} />
    <Animated
      as="div"
      style={{ position: 'relative', padding: '2rem' }}
      animated={['fade']}
    >
      <Text as="h2">Panel Title</Text>
      <p>Panel content here</p>
    </Animated>
  </Animator>
</div>
```

### Staggered List Items

```tsx
<Animator manager="stagger" duration={{ stagger: 0.08 }}>
  {items.map((item) => (
    <Animator key={item.id}>
      <Animated
        as="div"
        animated={['fade', ['x', 20, 0]]}
      >
        {item.content}
      </Animated>
    </Animator>
  ))}
</Animator>
```

### Alert with Sound

```tsx
<Animator>
  <BleepsOnAnimator<BleepsNames>
    transitions={{ entering: 'error' }}
  />
  <Animated
    as="div"
    animated={['flicker']}
    style={{
      border: '2px solid red',
      background: 'rgba(255, 0, 0, 0.1)'
    }}
  >
    <Text manager="decipher" fixed>
      CRITICAL ALERT
    </Text>
  </Animated>
</Animator>
```

## Styling Tips

### 1. Color Schemes

Use HSL colors for easy theming:

```tsx
const colors = {
  primary: 'hsl(180deg 75% 50%)',      // Cyan
  secondary: 'hsl(60deg 75% 50%)',     // Yellow
  accent: 'hsl(120deg 75% 50%)',       // Green
  danger: 'hsl(0deg 75% 50%)',         // Red
}

<FrameCorners
  style={{
    '--arwes-frames-line-color': colors.primary,
    '--arwes-frames-bg-color': `${colors.primary} / 10%`
  }}
/>
```

### 2. Responsive Sizing

Frames automatically scale with their container:

```tsx
<div style={{
  position: 'relative',
  width: '100%',
  maxWidth: 600,
  aspectRatio: '16/9'
}}>
  <FrameOctagon />
  <div style={{ position: 'relative' }}>
    Responsive content
  </div>
</div>
```

### 3. Layering

Stack multiple effects using z-index:

```tsx
<div style={{ position: 'relative' }}>
  <GridLines style={{ zIndex: 1 }} />
  <MovingLines style={{ zIndex: 2 }} />
  <FrameCorners style={{ zIndex: 3 }} />
  <div style={{ position: 'relative', zIndex: 4 }}>
    Content on top
  </div>
</div>
```

## Performance Tips

1. **Disable animations when not needed:**
   ```tsx
   <AnimatorGeneralProvider disabled={reduceMotion}>
   ```

2. **Use `animated={false}` on static frames:**
   ```tsx
   <FrameCorners animated={false} />
   ```

3. **Simplify complex animations:**
   - Use fewer child animators when possible
   - Combine animations in one element instead of nesting
   - Use CSS transforms over layout properties

4. **Lazy load sound files:**
   - Bleeps are lazy-loaded by default
   - Provide multiple formats for browser compatibility

## Troubleshooting

### Issue: Components not animating

**Solutions:**
- Ensure `<Animator>` wraps your `<Animated>` components
- Check that `AnimatorGeneralProvider` has `disabled={false}`
- Verify animations aren't set to `animated={false}`

### Issue: Frames not responsive

**Solutions:**
- Ensure parent has `position: relative`
- Check that frame has default positioning (or `positioned={true}`)
- Verify parent has explicit dimensions

### Issue: Sounds not playing

**Solutions:**
- Check browser console for audio loading errors
- Verify audio file paths are correct
- Ensure user interaction occurred (browsers block autoplay)
- Provide fallback formats (webm + mp3)

### Issue: React Strict Mode errors

**Solution:**
- Arwes does not support React Strict Mode
- Remove `<React.StrictMode>` wrapper
- Or exclude Arwes components from strict mode

### Issue: Next.js hydration errors

**Solutions:**
- Add `'use client'` directive to components using Arwes
- Don't use Arwes in React Server Components
- Ensure SSR compatibility by checking for browser APIs

## Resources

- **Documentation Site:** https://arwes.dev
- **Original Repository:** https://github.com/arwes/arwes
- **This Fork (React 19):** https://github.com/amir-arad/arwes
- **npm Package (this project):** `@arwes/react`, pinned to `1.0.0-next.25020502`
- **npm Packages (scope):** `@arwes/*`
- **Discord Community:** https://discord.gg/s5sbTkw

## Package Reference

All packages in `@arwes/*` scope:

**Main Bundles:**
- `@arwes/react` - All React packages
- `@arwes/arwes` - All vanilla packages

**Vanilla (Framework-agnostic):**
- `@arwes/animator` - Animation orchestration
- `@arwes/animated` - HTML element animations
- `@arwes/bleeps` - Web Audio API wrapper
- `@arwes/text` - Text rendering effects
- `@arwes/frames` - SVG frames
- `@arwes/bgs` - Background effects
- `@arwes/theme` - Theming system
- `@arwes/tools` - Utilities

**React Wrappers:**
- `@arwes/react-animator` - React animator components
- `@arwes/react-animated` - Animated elements
- `@arwes/react-bleeps` - Sound manager
- `@arwes/react-text` - Text components
- `@arwes/react-frames` - Frame components
- `@arwes/react-bgs` - Background components
- `@arwes/react-tools` - React utilities
- `@arwes/react-core` - Core functionalities
- `@arwes/react-effects` - Special effects

## License

MIT License - See original repository for details.
