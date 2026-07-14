# pick2md

Chrome extension (Manifest V3): a DevTools-style hover picker that exports a single DOM element to Markdown. The reason this exists rather than using an off-the-shelf tool: pickers like PageMarkdown and MarkDownload resolve the hovered element via `elementFromPoint`/`mouseover`, which don't pierce shadow DOM — so they go completely dark (no highlight) on pages built with shadow-DOM web components. pick2md recursively pierces *open* shadow roots to keep working there.

## Stack

- Manifest V3, vanilla TypeScript — no UI framework. The interaction surface is one picker + one preview panel; a framework would be pure overhead.
- esbuild for bundling (`scripts/build.mjs`). MV3 content scripts can't fetch remote code, so dependencies (Turndown) are bundled locally, not loaded from a CDN.
- Turndown + `turndown-plugin-gfm` for HTML → Markdown conversion (tables, strikethrough).
- Chrome only for now — no Firefox/Edge port planned until the core picker is proven.

## Commands

```sh
npm install
npm run build     # bundle src/ -> dist/
npm run watch     # rebuild on change
```

Load `dist/` as an unpacked extension via `chrome://extensions` → Developer mode → Load unpacked.

## Structure

- `manifest.json` — copied into `dist/` on build (see `scripts/build.mjs`), not loaded from repo root directly.
- `src/background.ts` — MV3 service worker. No persistent state; its only job is injecting `content.js` into the active tab when the toolbar icon is clicked.
- `src/content.ts` — the picker itself. Injected on demand, fully torn down on Esc/dismiss (no lingering listeners or DOM nodes between activations).

## Core mechanism: shadow-DOM-piercing hit test

```ts
function resolveDeepTarget(x: number, y: number): Element | null {
  let el = document.elementFromPoint(x, y);
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}
```

Called on every `mousemove` while picker mode is active, descending through nested open shadow roots until it bottoms out at a leaf element. Closed shadow roots (`{mode: 'closed'}`) return `null` for `.shadowRoot` by spec — the loop naturally stops there. This is a hard platform limitation, not a bug: there is no API to pierce closed shadow trees, so don't attempt workarounds for it.

## Scope boundaries

**In scope:** hover-based element picker with shadow-DOM piercing, keyboard climb/descend (arrow up → `parentElement`, arrow down → last descended child) to refine a selection without re-hovering, HTML→Markdown conversion via Turndown, a floating preview panel with a copy-to-clipboard button.

**Explicitly out of scope — don't add without discussing first:**
- Full-page capture. Obsidian Web Clipper already does this well; this project exists specifically for element-level selection it can't do.
- Closed shadow root support. Not fixable from a content script.
- Cross-origin iframes. Blocked by same-origin policy; would need a different architecture (cooperating per-frame content scripts) not justified by any current failing case.
- CSS-selector persistence/reuse across pages (like PageMarkdown's "smart selector"). This is a one-shot picker, not a batch/templating tool.
- Download-as-file, multi-format export (PDF/DOCX/etc.), options page, Firefox/Edge ports.

## Testing

No automated test suite — the interesting bugs here are visual/interactive (does the highlight land on the right element?), not unit-testable logic. Verify manually against: a plain article page (baseline, no shadow DOM), a page with nested open shadow roots, and re-check after any change to `resolveDeepTarget` or the keyboard nav.
