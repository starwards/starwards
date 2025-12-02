# Arwes Alpha.19 → Alpha.23 Migration Research Results

Based on comprehensive research, here are the critical findings about migrating from Arwes alpha.19 to alpha.23:

***

### 🚨 **CRITICAL DISCOVERY: Alpha.20 Was a Complete API Overhaul**

**From the official release notes:**[1]

> "The project packages had an API overhaul with lots of breaking changes and optimizations. **This version should be taken as a new version entirely.**"
> 
> "Previous version `1.0.0-alpha.19` website was moved to version1-breakpoint2.arwes.dev and playground.version1-breakpoint2.arwes.dev."

**This means:** Alpha.19 and alpha.23 are fundamentally different frameworks. They're not compatible versions—they represent different architectural approaches.

***

### **What Happened Between Alpha.19 and Alpha.23**

#### **Alpha.19 (April 2021) - Component-Based Framework**
Had pre-built UI components from `@arwes/core`:
- `<Button>` - Clickable button with frame animations
- `<Card>` - Card layout with image, title, content
- `<Blockquote>` - Quote styling with borders
- `<ArwesThemeProvider>` - Theme context provider
- `<StylesBaseline>` - Global baseline styles

#### **Alpha.20-23 (June 2023 onwards) - Primitives Framework**
**Complete rewrite** to low-level primitives:
- ❌ **Removed:** All high-level components (`Button`, `Card`, `Blockquote`)
- ❌ **Removed:** `ArwesThemeProvider`, `StylesBaseline` as components
- ✅ **Added:** Primitive building blocks (`FrameSVGCorners`, `Text`, `Animated`)
- ✅ **Added:** `createAppTheme()`, `createAppStylesBaseline()` as functions
- ✅ **Changed:** Emotion `<Global/>` for styles instead of component wrapper

***

### **Migration Patterns: Old → New**

#### **1. Theming System**

**Alpha.19 Pattern:**
```jsx
import { ArwesThemeProvider, StylesBaseline } from '@arwes/core';

<ArwesThemeProvider>
  <StylesBaseline />
  <YourApp />
</ArwesThemeProvider>
```

**Alpha.23 Pattern:**
```jsx
import { type CSSObject, Global } from '@emotion/react';
import { createAppTheme, createAppStylesBaseline } from '@arwes/react';

const theme = createAppTheme();
const stylesBaseline = createAppStylesBaseline(theme);

<>
  <Global styles={stylesBaseline as Record<string, CSSObject>} />
  <YourApp />
</>
```

**Key Changes:**
- No more `ArwesThemeProvider` wrapper component
- Styles applied via Emotion's `<Global/>` component
- Theme created with utility function, not component prop

***

#### **2. AnimatorGeneralProvider**

**Both versions use similar API, but with refinements:**

**Alpha.19:**
```jsx
import { AnimatorGeneralProvider } from '@arwes/animation';

<AnimatorGeneralProvider animator={{ duration: { enter: 200, exit: 200 } }}>
```

**Alpha.23:**
```jsx
import { AnimatorGeneralProvider } from '@arwes/react';

const animatorsSettings = {
  duration: { 
    enter: 0.2,    // Now in SECONDS, not milliseconds
    exit: 0.2, 
    stagger: 0.04 
  }
};

<AnimatorGeneralProvider {...animatorsSettings}>
```

**Key Changes:**
- Durations now in **seconds** instead of milliseconds
- Import from `@arwes/react` instead of `@arwes/animation`

***

#### **3. BleepsProvider**

**API is similar but more streamlined:**

**Alpha.23 Pattern:**
```jsx
import { BleepsProvider } from '@arwes/react';

const bleepsSettings = {
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

<BleepsProvider {...bleepsSettings}>
```

***

#### **4. Component Replacements**

Since alpha.23 **removed all pre-built components**, you must build them from primitives.

##### **Button Component Replacement**

**Alpha.19 (Old):**
```jsx
import { Button } from '@arwes/core';

<Button animate onClick={handleClick}>
  Submit
</Button>
```

**Alpha.23 (Build Your Own):**
```jsx
import { useBleeps, BleepsOnAnimator, Animated, FrameSVGCorners, Text, aa, aaVisibility } from '@arwes/react';

const CustomButton = ({ children, onClick }) => {
  const bleeps = useBleeps();
  
  return (
    <Animator merge combine manager='stagger'>
      <BleepsOnAnimator transitions={{ entering: 'intro' }} continuous />
      <Animated
        className='custom-button'
        as='button'
        style={{
          position: 'relative',
          padding: theme.space(8),
          cursor: 'pointer',
          border: 'none',
          background: 'transparent'
        }}
        animated={[aaVisibility(), aa('y', '0.5rem', 0)]}
        onClick={() => {
          bleeps.click?.play();
          onClick?.();
        }}
      >
        <style>{`
          .custom-button .arwes-react-frames-framesvg [data-name=bg] {
            color: ${theme.colors.primary.deco(1)};
          }
          .custom-button .arwes-react-frames-framesvg [data-name=line] {
            color: ${theme.colors.primary.main(4)};
          }
        `}</style>
        
        <Animator>
          <FrameSVGCorners strokeWidth={2} />
        </Animator>
        
        <Animator>
          <Text>{children}</Text>
        </Animator>
      </Animated>
    </Animator>
  );
};
```

***

##### **Card Component Replacement**

**Official Example from Docs:**[2]
```jsx
import { useBleeps, BleepsOnAnimator, Animated, FrameSVGCorners, Text, aa, aaVisibility } from '@arwes/react';

const Card = () => {
  const bleeps = useBleeps();
  
  return (
    <Animator merge combine manager='stagger'>
      <BleepsOnAnimator transitions={{ entering: 'intro' }} continuous />
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
        animated={[aaVisibility(), aa('y', '2rem', 0)]}
        onClick={() => bleeps.click?.play()}
      >
        {/* Frame decoration colors defined by CSS */}
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
          <Text as='h1'>Arwes Project</Text>
        </Animator>
        
        <Animator>
          <Text>Futuristic science fiction user interface web framework.</Text>
        </Animator>
      </Animated>
    </Animator>
  );
};
```

***

##### **Blockquote Component Replacement**

**Alpha.19 (Old):**
```jsx
import { Blockquote } from '@arwes/core';

<Blockquote>Quote text here</Blockquote>
```

**Alpha.23 (Build Your Own):**
```jsx
import { Animator, Animated, Text, aa } from '@arwes/react';

const CustomBlockquote = ({ children }) => (
  <Animator>
    <Animated
      className='blockquote'
      style={{
        position: 'relative',
        borderLeft: `4px solid ${theme.colors.primary.main(5)}`,
        paddingLeft: theme.space(8),
        fontStyle: 'italic'
      }}
      animated={[aa('opacity', 0, 1)]}
    >
      <Text>{children}</Text>
    </Animated>
  </Animator>
);
```

***

#### **5. FrameCorners → FrameSVGCorners**

**Alpha.19:**
```jsx
import { FrameCorners } from '@arwes/core';

<FrameCorners />
```

**Alpha.23:**
```jsx
import { FrameSVGCorners } from '@arwes/react';

<FrameSVGCorners strokeWidth={2} />
```

**Changes:**
- Renamed from `FrameCorners` to `FrameSVGCorners`
- Additional styling control via CSS classes targeting `[data-name=bg]` and `[data-name=line]`
- Default `z-index: -1` to behave as background[1]

***

### **Import Path Consolidation**

**Alpha.19 - Multiple Packages:**
```jsx
import { ArwesThemeProvider, Button, Card, StylesBaseline, Text } from '@arwes/core';
import { AnimatorGeneralProvider } from '@arwes/animation';
import { BleepsProvider } from '@arwes/sounds';
```

**Alpha.23 - Single Meta-Package:**
```jsx
import { 
  createAppTheme,
  createAppStylesBaseline,
  AnimatorGeneralProvider,
  Animator,
  BleepsProvider,
  useBleeps,
  BleepsOnAnimator,
  Animated,
  FrameSVGCorners,
  Text,
  aa,
  aaVisibility
} from '@arwes/react';

import { type CSSObject, Global } from '@emotion/react';
```

**Key Change:** Everything now imported from `@arwes/react` meta-package (which re-exports all vanilla and React packages).[2]

***

### **Installation Changes**

**Alpha.19:**
```bash
npm install @arwes/design @arwes/animation @arwes/sounds @arwes/core
npm install react@17 react-dom@17 @emotion/css@11 @emotion/react@11 polished@4 animejs@3 howler@2.2
```

**Alpha.23:**
```bash
npm install @arwes/react@1.0.0-alpha.23
npm install @emotion/react
```

**Much simpler!** Single package instead of four, fewer peer dependencies.

***

### **⚠️ Critical Warnings**

#### **1. Alpha.23 Stability Concerns**

From research findings:
- **Alpha.23 released August 2023** (over 1 year ago)[1]
- **Latest development on `next` branch** uses `1.0.0-next.*` versions[3]
- Community discussions show **limited production use** of alpha.23

#### **2. Production Readiness**

From official FAQ:[4]
> "Arwes is currently in alpha release. It means there is ongoing development with breaking changes. APIs and guidelines can change as they get completed. The project will be ready for production when it has a stable and tested API."

**Status badges from docs:**[2]
- `@arwes/react`: **Polishing** (not production-ready)
- `@arwes/react-core`: **Specification** (not even development stage)

#### **3. Missing Components**

Even alpha.23 lacks many standard UI components:
- No Select/Dropdown component (open issue #137)[5]
- No Modal component
- No Form components
- No Input components

**You must build these from scratch using primitives.**

***

### **Working Example: Full App Setup (Alpha.23/Next Pattern)**

```jsx
import { type ReactElement } from 'react';
import { type CSSObject, Global } from '@emotion/react';
import { 
  createAppTheme,
  createAppStylesBaseline,
  AnimatorGeneralProvider,
  Animator,
  BleepsProvider,
  useBleeps,
  BleepsOnAnimator,
  Animated,
  FrameSVGCorners,
  Text,
  aa,
  aaVisibility
} from '@arwes/react';

// 1. Create theme
const theme = createAppTheme();
const stylesBaseline = createAppStylesBaseline(theme);

// 2. Animation settings
const animatorsSettings = {
  duration: { 
    enter: 0.2, 
    exit: 0.2, 
    stagger: 0.04 
  }
};

// 3. Sound settings
const bleepsSettings = {
  master: { volume: 0.9 },
  bleeps: {
    intro: { 
      sources: [{ 
        src: '/sounds/intro.mp3', 
        type: 'audio/mpeg' 
      }] 
    },
    click: { 
      sources: [{ 
        src: '/sounds/click.mp3', 
        type: 'audio/mpeg' 
      }] 
    }
  }
};

// 4. Custom Button Component
const CustomButton = ({ children, onClick }) => {
  const bleeps = useBleeps();
  
  return (
    <Animator merge combine manager='stagger'>
      <Animated
        as='button'
        className='custom-button'
        style={{
          position: 'relative',
          padding: theme.space(8),
          cursor: 'pointer',
          border: 'none',
          background: 'transparent'
        }}
        animated={[aaVisibility()]}
        onClick={() => {
          bleeps.click?.play();
          onClick?.();
        }}
      >
        <style>{`
          .custom-button .arwes-react-frames-framesvg [data-name=line] {
            color: ${theme.colors.primary.main(4)};
          }
        `}</style>
        
        <Animator>
          <FrameSVGCorners strokeWidth={2} />
        </Animator>
        
        <Animator>
          <Text>{children}</Text>
        </Animator>
      </Animated>
    </Animator>
  );
};

// 5. Root App Component
const App = (): ReactElement => {
  return (
    <>
      {/* Global styles */}
      <Global styles={stylesBaseline as Record<string, CSSObject>} />
      
      {/* Disable React Strict Mode in Next.js config! */}
      <AnimatorGeneralProvider {...animatorsSettings}>
        <BleepsProvider {...bleepsSettings}>
          <Animator combine manager='stagger' active={true}>
            <CustomButton onClick={() => console.log('Clicked!')}>
              Submit
            </CustomButton>
          </Animator>
        </BleepsProvider>
      </AnimatorGeneralProvider>
    </>
  );
};

export default App;
```

**Next.js config (REQUIRED):**
```js
// next.config.js
module.exports = {
  reactStrictMode: false  // Arwes doesn't work with strict mode
};
```

***

### **Key Resources**

1. **Official Docs (Current):** https://arwes.dev/docs/develop[2]
2. **Next Branch Docs:** https://next.arwes.dev/docs/develop/react[6]
3. **Playground:** https://next.arwes.dev/play[7]
4. **Old Alpha.19 Docs:** https://version1-breakpoint2.arwes.dev[8]
5. **GitHub Releases:** https://github.com/arwes/arwes/releases[1]
6. **Discord Community:** https://discord.com/channels/457381046497968128

***

### **Summary**

**Don't migrate to alpha.23.** It's outdated compared to your current `next` version. Instead:

✅ **Keep using `1.0.0-next.*` versions** - They're more actively developed
✅ **Build custom components** - Button, Card, Blockquote using primitives
✅ **Use Emotion for theming** - `createAppTheme()` + `<Global/>`
✅ **Reference `next.arwes.dev`** - Not the alpha.23 docs

❌ **Avoid downgrading** - Alpha.23 is over a year old with no updates since
❌ **Don't expect pre-built components** - Framework philosophy changed entirely

The framework shifted from "UI component library" to "UI primitive toolkit." You're expected to build your own design system on top of it.

[1](https://github.com/arwes/arwes/releases)
[2](https://arwes.dev/docs/develop)
[3](https://npm.io/package/arwes)
[4](https://version1-breakpoint2.arwes.dev/project/faq/)
[5](https://www.libhunt.com/r/arwes)
[6](https://next.arwes.dev/docs/develop/react)
[7](https://next.arwes.dev/play)
[8](https://version1-breakpoint2.arwes.dev/develop/core/)
[9](https://github.com/ccamel/awesome-ccamel)
[10](https://sourceforge.net/projects/arwes.mirror/files/v1.0.0-alpha.19/)
[11](https://github.com/arwes/arwes)
[12](https://dev.to/iainfreestone/10-trending-projects-on-github-for-web-developers-4th-september-2020-bi0)
[13](https://tailscale.com/changelog)
[14](https://openjsf.org/blog/openjs-security-checkpoint-2025-so-far)
[15](https://news.ycombinator.com/item?id=17809887)
[16](https://www.reddit.com/r/starcitizen/comments/1lffnf2/star_citizen_alpha_42_patch_notes/)
[17](https://www.facebook.com/groups/629803784169356/posts/2137079163441803/)
[18](https://docs.easybuild.io/release-notes/)
[19](https://www.ema.europa.eu/en/documents/product-information/elfabrio-epar-product-information_en.pdf)
[20](https://community.home-assistant.io/t/fun-with-custom-button-card/238450)
[21](https://github.com/flutter/flutter/issues/107946)
[22](https://www.youtube.com/watch?v=2RMCQzcT7x0)
[23](https://gist.github.com/s-macke/ae83f6afb89794350f8d9a1ad8a09193)
[24](https://www.youtube.com/watch?v=EumKl7pwGM8)
[25](https://www.youtube.com/watch?v=SEyrcLq8pRo)
[26](https://github.com/lokesh-coder/my-awesome-list?search=1)
[27](https://www.youtube.com/watch?v=5Pi21pqfbxA)
[28](https://github.com/paulveillard/cybersecurity-iOS)
[29](https://www.reddit.com/r/homeassistant/comments/1l9gqfw/custom_button_templates/)
[30](https://github.com/BOINC/boinc/wiki/Client-release-notes)
[31](https://custom-cards.github.io/button-card/)
[32](https://github.com/terraforming-mars/terraforming-mars/wiki/Changelog)
[33](https://www.youtube.com/watch?v=D2AmZCuk18Q)
[34](https://github.com/pfultz2/awesome-cpp-1)
[35](https://www.reddit.com/r/homeassistant/comments/1k5dm9c/ui_forecast_custombuttoncard_template_dilemma/)
[36](https://www.facebook.com/groups/1272878646637296/posts/1893645944560560/)
[37](https://version1-breakpoint1.arwes.dev/api/button)
[38](https://version1-breakpoint2.arwes.dev/develop/design/)
[39](https://next.arwes.dev/docs/develop/react/bgs)
[40](https://github.com/arwes/arwes/issues/131)
[41](https://bluebase.gitbook.io/core/key-concepts/themes)
[42](https://next.arwes.dev/docs/develop/react/text)
[43](https://www.libhunt.com/compare-arwes-vs-augmented-ui)
[44](https://codesandbox.io/examples/package/arwes)
[45](https://next.arwes.dev/docs/develop/fundamentals/motion)
[46](https://www.tkcnn.com/github/arwes/arwes.html)
[47](https://codesandbox.io/examples/package/@arwes/design)
[48](https://next.arwes.dev/docs/develop/vanilla)
[49](https://next.arwes.dev/play?explorer=true&editor=true&preview=true&dark=true&type=predefined&code=&sandbox=%40arwes%2Fanimated%7CAnimated%7Cbasic)
[50](https://github.com/arwes/arwes/blob/next/README.md)
[51](https://arwes.dev)
[52](https://www.envoyproxy.io/docs/envoy/latest/version_history/v1.29/v1.29.11)
[53](https://floatfarm-project.eu/wp-content/uploads/2025/05/DELIVERABLE-D7.1-Qblade-Interfacing-framework.pdf)
[54](https://www.reddit.com/r/HadesTheGame/comments/1nqb1ph/hades_2_10_release_notes/)
[55](https://www.codefactor.io/repository/github/arwes/arwes)
[56](https://github.com/microsoft/vcpkg/releases)
[57](https://daniel.haxx.se/blog/2024/06/)
[58](https://arwes.dev/docs)
[59](https://github.com/arwes/arwes/issues)
[60](https://rail-research.europa.eu/wp-content/uploads/2025/08/D21.1-%E2%80%93-Operational-requirements-and-system-capabilities-of-an-ASTP-system.pdf)
[61](https://www.reddit.com/r/nextjs/comments/1b00u6w/if_you_had_to_make_a_production_ready_app_today/)
[62](https://forum.manjaro.org/t/stable-update-2024-02-21-kernels-kde-virtualbox-calamares-rocm-firefox-thunderbird/156888?page=3)
[63](https://sourceforge.net/projects/arwes.mirror/)
[64](https://github.com/arwes/arwes/issues/86)
[65](https://www.reddit.com/r/7daystodie/comments/1czgr34/a_list_of_missing_broken_or_removed_features_from/)
[66](https://steamcommunity.com/app/251570/discussions/1/2570942124843843936/)
[67](https://www.cac.gov.ng/wp-content/uploads/2024/01/STRUCK_OFF_FINAL_LIST_2024.pdf)
[68](https://github.com/arwes/arwes/issues/46)
[69](https://www.facebook.com/groups/ConcordeHC/posts/9149144295124097/)
[70](https://home.treasury.gov/news/press-releases/jy2785)
[71](https://github.com/arwes/arwes/issues/83)
[72](https://pmc.ncbi.nlm.nih.gov/articles/PMC9021367/)
[73](https://www.worksafebc.com/en/law-policy/occupational-health-safety/searchable-ohs-regulation/ohs-guidelines/guidelines-part-20)
[74](https://www.npmjs.com/package/arwes?activeTab=versions)
[75](https://www.libhunt.com/compare-arwes-vs-NES.css)