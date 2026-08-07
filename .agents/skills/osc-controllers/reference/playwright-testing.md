# Testing Open Stage Control widgets with Playwright

Verified from v1.30.3 client source (`src/client/widgets/common/widget.mjs`, `sliders/fader.mjs`, `events/drag.mjs`, `managers/widgets.mjs`). Runtime-verify on first use — these recipes were derived from source, not yet exercised.

## DOM structure

Every widget root:

```html
<div class="widget {type}-container" id="{hash}" data-widget="{hash}"></div>
```

- `{hash}` is an **internal uuid**, not the user-defined widget `id`. Do NOT select by `#my_widget_id` — it won't match.
- Type-level CSS selection works: `.widget.fader-container`, `.widget.push-container`.
- Each container carries a live back-reference: `el._widget_instance` → the widget object (`getValue()`, `getProp(name)`, `setValue(v, options)`).
- The client's `widgetManager` (indexes by hash, user id, and OSC address) is module-scoped, NOT on `window` — the `_widget_instance` back-reference is the only stable page-side handle.

## Locating a widget by user id / reading its value

```ts
const value = await page.evaluate((wantedId) => {
  for (const el of document.querySelectorAll('[data-widget]')) {
    const w = (el as any)._widget_instance
    if (w && w.getProp('id') === wantedId) return w.getValue()
  }
  return undefined
}, 'reactor_power')
```

Same loop with `w.getProp('address')` locates by OSC address. To get a bounding box for pointer interaction, return `el.getBoundingClientRect()` from the same loop (or set a per-widget `css` class in the session file and use a normal locator).

## Values are NOT in the DOM for canvas widgets

`fader`, `knob`, `xy`, `multixy`, `range`, meters and LEDs draw to `<canvas>`; there is no DOM text/attribute holding the value. DOM widgets (`input`, `text`, `switch`, buttons) do expose value in the DOM. Never scrape canvas pixels — use `_widget_instance.getValue()`.

## Driving widgets

The client listens to **pointer and touch events** (`pointerdown/move/up`, `touchstart/move/end/cancel` — from `events/drag.mjs`), synthesizing internal `draginit`/`drag`/`dragend`.

- Playwright `page.mouse.down/move/up` emits pointer events in Chromium → works for single-pointer widgets (fader, knob, xy, toggle, push). Press/release semantics for momentary buttons: `mouse.down()` … `mouse.up()` are distinct OSC emissions.
- Multi-touch widgets (`multixy`, per-handle `range`) need touch events — use `page.touchscreen` or `dispatchEvent` with `Touch` init.
- Precision drag is Ctrl+drag (10× ratio); traversing gestures change drag semantics across widgets — avoid enabling them in test layouts.

## Gotchas

- `hdpi`/`forceHdpi`/`zoom` client URL options scale the canvas — keep them unset (defaults) in test URLs so pointer coordinates map 1:1.
- Widget `id`s must be unique in the session for the `getProp('id')` lookup to be deterministic.
- Remote-control commands (`/SET`, `/GET`, `/STATE/SEND`) offer a server-side alternative for assertions, but they exercise the server path, not the touch UI — use them for setup/teardown, not as a substitute for pointer-driven assertions.
- Session load is async: wait for `[data-widget]` count > 0 (or a known `.widget.fader-container`) before evaluating.
