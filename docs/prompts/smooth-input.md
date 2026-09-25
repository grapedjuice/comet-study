You are given a task to integrate a new React component into the codebase: **Smooth Input**, a text field where typing feels fluid. Each new letter drops in from slightly above, un-blurs and settles into place; deleted letters fall away; the caret glides to its new position instead of jumping.

The codebase should support:
- Next.js App Router with React 19 client components
- TypeScript
- Plain CSS (no Tailwind in this project; styles live in the route group's CSS file)

Determine the default path for shared UI (here: `app/(app)/ui/`) and put the component there as `smooth-input.tsx`, with its styles in `app/(app)/app.css`.

## Behavior contract

1. **The native field stays the source of truth.** Keep a real `<input>`/`<textarea>` for focus, selection, IME, autofill, undo, form submission and screen readers. Make its text transparent (`color: transparent`, `caret-color: transparent`) and draw the visible text in a mirror layer underneath with identical box metrics (font, size, letter-spacing, padding, line-height, border width). Disable kerning and ligatures on both (`font-kerning: none; font-variant-ligatures: none`) so per-letter spans line up exactly with the native glyph positions that clicks and selection use.
2. **Stable identity per character.** Keep an array of ids parallel to the characters. On each change, diff old and new value by common prefix and common suffix: keep prefix ids and suffix ids, mint new ids only for the inserted run. React keys = ids, so only genuinely new letters mount and animate. Paste, autocomplete and programmatic `defaultValue` get ids without animation on first render.
3. **Letters fall into place.** A mounted letter plays a one-shot CSS keyframe: from `translateY(-0.7em) scale(1.18)`, `opacity: 0`, `filter: blur(4px)` to rest, about 500ms with a spring-like overshoot `cubic-bezier(0.34, 1.56, 0.64, 1)`. Letters are `inline-block` (transforms don't apply to inline boxes) with `white-space: pre` so spaces keep their width. When many letters arrive at once (paste), stagger them 12ms apart, capped at 240ms in total.
4. **Deleted letters fall away.** Before the DOM updates, measure the removed letters' positions and render them as absolutely positioned ghosts in an overlay that drop `0.4em`, fade and blur over 260ms, then unmount.
5. **Gliding caret.** Hide the native caret and render a 2px gradient caret (indigo to teal) positioned from the measured letter offsets at `selectionStart`. Move it with a 110ms transform transition and blink only while idle (the blink restarts after every move). Hide it when the selection isn't collapsed or the field isn't focused. The native `::selection` highlight still paints over the mirror text.
6. **Scrolling.** Mirror the field's `scrollLeft`/`scrollTop` onto the mirror layer on input, scroll, keyup, select and selectionchange so long values stay aligned.
7. **Textarea.** Same, with the mirror at `white-space: pre-wrap; overflow-wrap: break-word`. Wrap each word's letters in an inline-block, no-wrap group so line breaks happen at spaces, like the textarea's own wrapping.
8. **Scope.** Only text-like fields that expose selection APIs: `text`, `search`, `url`, `tel`, `password` (render bullets) and `textarea`. Leave `email`, `number`, `date` and `time` native.
9. **Accessibility and motion.** The mirror, ghosts and caret are `aria-hidden`. Under `prefers-reduced-motion: reduce`, letters appear without animation and the caret doesn't glide or blink (the site's global reduced-motion rule already zeroes animations and transitions). Placeholders stay native (`::placeholder` keeps its own color).
10. **API.** A drop-in for the existing field: `<SmoothInput className="field" name=… defaultValue=… {...inputProps} />` and `<SmoothTextarea …/>`. Uncontrolled by default and forwards all native props. Works inside `<form>` reset: listen for the form's `reset` event and resync.

## Usage

```tsx
import { SmoothInput, SmoothTextarea } from "../ui/smooth-input";

<label className="form-field">
  <span className="field-label">Group name</span>
  <SmoothInput className="field" name="name" maxLength={60} required placeholder="Tuesday problem-set crew" />
</label>

<SmoothTextarea className="field" name="notes" rows={3} placeholder="Bring problem set 4" />
```

Install NPM dependencies: none (React only).

Implementation Guidelines
 1. Match the mirror's box model to the field exactly; verify by typing a long sentence and clicking between letters: the glided caret must land where the native one would.
 2. Measure with `offsetLeft`/`offsetTop` of the letter spans (layout positions, unaffected by transforms).
 3. Diff in `onInput` using the previous value kept in a ref; never re-key unchanged letters.
 4. Keep work per keystroke to O(n) with no layout thrash: one layout read after render (useLayoutEffect) for the caret.
 5. Questions to ask
 - Which fields should get the effect (all app text fields and textareas)?
 - Does any consumer read the input through a ref? Forward the ref.

Steps to integrate
 0. Create `app/(app)/ui/smooth-input.tsx` and its CSS block in `app/(app)/app.css`
 1. Replace text-like `.field` inputs and textareas in app forms with the component
 2. Verify in a real browser: typing, backspace, paste, selection, click-to-place, long-value scroll, form reset after submit, reduced motion
