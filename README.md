# pick2md

A Chrome extension that lets you point at any element on a page — like DevTools' inspect mode — and export just that element as clean Markdown to your clipboard.

Most existing "page to Markdown" pickers rely on `elementFromPoint`/`mouseover`, which don't pierce shadow DOM. On pages that use shadow-DOM web components, their pickers go dark: hovering highlights nothing. pick2md resolves the real element under the cursor by recursively piercing *open* shadow roots, so it keeps working where those tools don't.

## Status

Early scaffold — core picker logic is not yet implemented (see `src/content.ts` for the TODOs).

## Development

```sh
npm install
npm run build     # bundles to dist/
npm run watch     # rebuild on change
```

Load `dist/` as an unpacked extension via `chrome://extensions` (Developer mode → Load unpacked).

## Scope

- Hover-based element picker with shadow-DOM piercing
- Keyboard climb/descend to refine the selection (like DevTools' element hierarchy)
- HTML → Markdown conversion via Turndown (GFM tables, strikethrough)
- Copy-to-clipboard preview panel

**Not in scope:** full-page capture (use Obsidian Web Clipper for that), closed shadow roots (no browser API to pierce them), cross-origin iframes.
