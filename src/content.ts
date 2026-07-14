// Picker content script — injected on demand (see background.ts), never persistent.
// See technical-architecture.md in the planning doc for the full design.

/** Resolves the real element under (x, y), piercing open shadow roots. */
function resolveDeepTarget(x: number, y: number): Element | null {
  let el = document.elementFromPoint(x, y);
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

// TODO: highlight overlay (fixed-position div driven by target.getBoundingClientRect())
// TODO: mousemove listener calling resolveDeepTarget + updating the overlay
// TODO: keyboard climb/descend (arrow up -> parentElement, arrow down -> last descended child)
// TODO: click handler -> capture outerHTML, run through Turndown, show preview panel
// TODO: preview panel with Copy button (navigator.clipboard.writeText)
// TODO: Esc handler tearing down all of the above

export {};
