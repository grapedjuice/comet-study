# Comet Study visual system

## Direction

Midnight glass. A live WebGL sky (Three.js) sits behind translucent, blurred surfaces; content rises toward the reader as the page scrolls. Geist carries the interface; Instrument Serif italic, filled with the indigo → sky → teal gradient, gives headlines their voice. Both fonts are bundled locally through Fontsource.

Palette: background #04050B, ink #EEF0FB, muted #A6ABC6, faint #7C82A3, indigo #8B7BFF, sky #6CC6FF, teal #5EEAD4, comet #FFC38A. Glass surfaces are rgba(12–18, 14–20, 30–44, .5–.8) with 1px white borders at 8–16% and 18–28px backdrop blur. The site is dark-only.

Sources from 21st.dev (prompts saved under `.tmp/21st/`): Fluid Field Background (ThreeUI) for `app/ui/cosmos.tsx`, rebuilt natively and extended with scroll-depth drift, a palette that travels down the page, cursor light, parallax stars and passing comets; Smooth Scroll (Lenis) for `app/ui/smooth-scroll.tsx`; Stacking Cards for "How it works"; Blur Reveal for headlines; Container Scroll for the tilting hero demo; Smooth Cursor (Magic UI) extended with a canvas comet tail for `app/ui/comet-cursor.tsx`.

## Motion system

- `Rise` — scroll-linked (not timed): sections lift 120px, un-tilt 14°, scale from .92 and un-blur as they enter, so they arrive at the reader.
- `StackingCard` — sticky cards; each new step slides up over the last, which scales down and dims.
- `TiltPanel` — the hero demo starts laid back and stands up as the hero scrolls away.
- `ScrollRail` replaces the native scrollbar with a draggable gradient thumb; `ScrollProgress` is a top hairline.
- The comet cursor runs only for fine pointers without reduced motion; the core dot tracks the pointer exactly, the ring and tail spring behind. Text inputs keep the native caret.

## Behavior and truthfulness

- The primary action remains “Find my study group,” linking to the existing /sign-in email form. The same request-verification endpoint handles submission and validation. This UI work does not complete email delivery or backend group matching.
- The hero demo contains three deterministic course fixtures and explicitly fictional students and availability. Course selection updates the group and overlap; time selection updates the proposed session; the proposal button confirms or resets demo-only state. It sends no requests and stores no data.
- Miniature examples below the hero are labeled illustrations. No live activity, adoption counts, endorsements, real student identities, or supported room availability are implied.
- Privacy copy distinguishes what the local demo does from the intended, still-unimplemented schedule-sharing controls.

## Accessibility

Reduced motion disables Lenis, the cursor, scroll-linked transforms and CSS animation, and the shader renders a static frame. Native buttons expose pressed states, a live region announces demo changes, the availability table has row/column headers, and links and controls keep visible keyboard focus. Axe (WCAG 2.2 AA) runs in the e2e suite with reduced motion emulated so every section is audited at rest.

