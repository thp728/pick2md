# Decisions

Non-obvious choices made while implementing the picker (`src/content.ts`). One
entry per decision: what and why.

## Picker UI lives in its own open shadow root
The overlay and preview panel are mounted inside a `#pick2md-root` host with
`attachShadow({ mode: "open" })`, styled via a `<style>` in that root. Rationale:
the picker runs on arbitrary pages whose CSS could otherwise restyle our overlay
(and our `all: initial` styles could bleed onto the page). A shadow root gives
two-way isolation with no build-time CSS scoping. It stays *open* so it's
consistent with the project's "we pierce open shadow roots" stance and remains
debuggable.

## Keyboard climb crosses open shadow boundaries (`climbFrom`)
AGENTS.md specifies ArrowUp → `parentElement`. A bare `parentElement` returns
`null` at the top of a shadow tree, which would dead-end climbing on exactly the
shadow-DOM pages this project targets. `climbFrom` falls back to the shadow
host (`getRootNode().host`) so the hierarchy stays continuous across open shadow
boundaries. Purely additive; never crosses a *closed* root (out of scope).

## Re-injection toggles instead of stacking
`background.ts` re-injects `content.js` on every toolbar click. Rather than
building a second overlay on top of a live one, activation state is stored on
`window.__pick2md__`; a second click while active tears the picker down. So the
toolbar button reads as an on/off toggle, matching Esc.

## Enter commits, in addition to click
Once a selection is refined with the arrow keys, reaching for the mouse to click
would risk re-hovering and losing the refinement. Enter commits the current
selection (same path as click) so keyboard refinement can finish on the keyboard.

## Output shown in a read-only `<textarea>`, auto-selected
The preview uses a read-only textarea rather than a `<pre>`. It preserves the raw
Markdown exactly, and — selected on open — makes the manual-copy fallback a
single Ctrl/Cmd+C when the async Clipboard API is unavailable or blocked (e.g.
missing focus/permission). The Copy button flashes "Copied!" on success or
"Press Ctrl/Cmd+C" on failure.

## Clipboard fallback chain
`navigator.clipboard.writeText` first; on throw/absence, fall back to selecting
the textarea and `document.execCommand("copy")`; if that also fails, leave the
text selected and prompt the user. Covers insecure contexts and permission
denials without an extra permission in the manifest.

## Preview panel placement / theming
Fixed bottom-right, `min(460px, 100vw-32px)` wide, capped height with an internal
scroll, and a `prefers-color-scheme: dark` variant. Defensible default that keeps
the panel out of the way of most page content; not configurable (an options page
is explicitly out of scope).

## Tooling: `@types/turndown` + ambient decl + typecheck script
`turndown` has `@types/turndown`; `turndown-plugin-gfm` ships no types, so
`src/turndown-plugin-gfm.d.ts` declares the `gfm` export we use. Added an
`npm run typecheck` (`tsc --noEmit`) script because the esbuild bundle step does
no type checking — the build succeeding alone wouldn't catch type errors.

## Out-of-scope cases deliberately not handled
- **Closed shadow roots** — no API to pierce; the hit-test loop stops naturally.
- **Cross-origin iframes** — `elementFromPoint` can't enter them; would need a
  per-frame content-script architecture, not justified yet.
- **Persistence / multi-format export / download-as-file / options page** — none
  added; this stays a one-shot clipboard picker.
