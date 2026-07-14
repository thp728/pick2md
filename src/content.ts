// Picker content script — injected on demand (see background.ts), never persistent.
// See technical-architecture.md in the planning doc for the full design.
//
// Lifecycle: each toolbar click re-injects this file. A single activation owns
// one overlay, one preview panel, and a small set of listeners; Esc (or a second
// toolbar click) tears all of it down so nothing lingers between activations.

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const ROOT_ID = "pick2md-root";
const Z = "2147483647"; // max 32-bit z-index — sit above page chrome

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

/**
 * The element one step "up" from `el`. Uses parentElement within a tree, and
 * crosses an open shadow boundary to the host when at a shadow root's top —
 * so climbing keeps working on shadow-DOM pages instead of dead-ending.
 */
function climbFrom(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  if (root instanceof ShadowRoot) return root.host;
  return null;
}

class Picker {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly overlay: HTMLElement;
  private readonly label: HTMLElement;

  /** Element currently under consideration (hovered or keyboard-refined). */
  private current: Element | null = null;
  /** Children we climbed up from, so ArrowDown can descend back into them. */
  private descendStack: Element[] = [];
  /** True once a selection is committed and the preview panel is showing. */
  private frozen = false;
  private panel: HTMLElement | null = null;

  constructor() {
    // Host + shadow root keep the picker's own styles isolated from the page
    // (and the page's CSS from leaking into the picker).
    this.host = document.createElement("div");
    this.host.id = ROOT_ID;
    this.host.style.cssText = "all: initial;";
    this.root = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = CSS;
    this.root.appendChild(style);

    this.overlay = document.createElement("div");
    this.overlay.className = "p2m-overlay";
    this.label = document.createElement("div");
    this.label.className = "p2m-label";
    this.overlay.appendChild(this.label);
    this.root.appendChild(this.overlay);

    document.documentElement.appendChild(this.host);

    // Listeners are bound instances so removeEventListener works on teardown.
    document.addEventListener("mousemove", this.onMouseMove, true);
    document.addEventListener("click", this.onClick, true);
    document.addEventListener("keydown", this.onKeyDown, true);
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (this.frozen) return;
    const target = resolveDeepTarget(e.clientX, e.clientY);
    if (!target || target === this.host) {
      return; // ignore our own chrome / empty space
    }
    // A fresh hover resets any keyboard refinement history.
    this.descendStack = [];
    this.select(target);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      teardown();
      return;
    }
    if (this.frozen || !this.current) return;

    if (e.key === "ArrowUp") {
      const parent = climbFrom(this.current);
      if (parent) {
        e.preventDefault();
        this.descendStack.push(this.current);
        this.select(parent);
      }
    } else if (e.key === "ArrowDown") {
      const child = this.descendStack.pop();
      if (child) {
        e.preventDefault();
        this.select(child);
      }
    } else if (e.key === "Enter") {
      // Enter commits the current selection, mirroring a click.
      e.preventDefault();
      this.commit();
    }
  };

  private onClick = (e: MouseEvent): void => {
    if (this.frozen) return;
    // Swallow the page click entirely — we're picking, not interacting.
    e.preventDefault();
    e.stopPropagation();
    this.commit();
  };

  /** Point the picker at `el` and redraw the highlight. */
  private select(el: Element): void {
    this.current = el;
    this.drawHighlight(el);
  }

  private drawHighlight(el: Element): void {
    const r = el.getBoundingClientRect();
    const s = this.overlay.style;
    s.display = "block";
    s.top = `${r.top}px`;
    s.left = `${r.left}px`;
    s.width = `${r.width}px`;
    s.height = `${r.height}px`;
    this.label.textContent = describe(el);
  }

  /** Freeze the current selection, convert it, and show the preview panel. */
  private commit(): void {
    if (!this.current) return;
    this.frozen = true;
    // Stop hover/click picking; keep keydown alive for Esc.
    document.removeEventListener("mousemove", this.onMouseMove, true);
    document.removeEventListener("click", this.onClick, true);

    let markdown: string;
    try {
      markdown = toMarkdown(this.current.outerHTML);
    } catch (err) {
      markdown = `<!-- pick2md: conversion failed: ${String(err)} -->`;
    }
    this.showPanel(markdown);
  }

  private showPanel(markdown: string): void {
    const panel = document.createElement("div");
    panel.className = "p2m-panel";

    const header = document.createElement("div");
    header.className = "p2m-panel-header";
    const title = document.createElement("span");
    title.textContent = "pick2md";
    const actions = document.createElement("div");
    actions.className = "p2m-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "p2m-btn p2m-copy";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => this.copy(markdown, copyBtn, textarea));

    const closeBtn = document.createElement("button");
    closeBtn.className = "p2m-btn p2m-close";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => teardown());

    actions.append(copyBtn, closeBtn);
    header.append(title, actions);

    const textarea = document.createElement("textarea");
    textarea.className = "p2m-output";
    textarea.readOnly = true;
    textarea.value = markdown;
    textarea.spellcheck = false;

    const hint = document.createElement("div");
    hint.className = "p2m-hint";
    hint.textContent = "Esc to dismiss";

    panel.append(header, textarea, hint);
    this.root.appendChild(panel);
    this.panel = panel;

    // Selecting the text makes the manual-copy fallback trivial.
    textarea.focus();
    textarea.select();
  }

  private async copy(
    markdown: string,
    btn: HTMLButtonElement,
    textarea: HTMLTextAreaElement,
  ): Promise<void> {
    const ok = await copyText(markdown, textarea);
    if (ok) {
      flash(btn, "Copied!");
    } else {
      // Visible fallback: keep the text selected and tell the user to copy it.
      textarea.focus();
      textarea.select();
      flash(btn, "Press Ctrl/Cmd+C");
    }
  }

  destroy(): void {
    document.removeEventListener("mousemove", this.onMouseMove, true);
    document.removeEventListener("click", this.onClick, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    this.panel?.remove();
    this.host.remove();
    this.current = null;
    this.descendStack = [];
  }
}

// ---- module-level activation state (survives across re-injections) ----------

declare global {
  interface Window {
    __pick2md__?: { picker: Picker | null };
  }
}

function teardown(): void {
  const state = window.__pick2md__;
  if (state?.picker) {
    state.picker.destroy();
    state.picker = null;
  }
}

// Re-injection acts as a toggle: activate if idle, tear down if already active.
(() => {
  const state = (window.__pick2md__ ??= { picker: null });
  if (state.picker) {
    teardown();
  } else {
    state.picker = new Picker();
  }
})();

// ---- helpers ----------------------------------------------------------------

let turndown: TurndownService | null = null;

function toMarkdown(html: string): string {
  if (!turndown) {
    turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    turndown.use(gfm);
  }
  return turndown.turndown(html).trim();
}

/** A short DevTools-style descriptor: tag#id.class — dims·small. */
function describe(el: Element): string {
  let s = el.tagName.toLowerCase();
  if (el.id) s += `#${el.id}`;
  const cls = (el.getAttribute("class") || "").trim();
  if (cls) s += "." + cls.split(/\s+/).slice(0, 2).join(".");
  const r = el.getBoundingClientRect();
  return `${s}  ${Math.round(r.width)}×${Math.round(r.height)}`;
}

/** Copy `text`, falling back to execCommand on the given textarea. Returns success. */
async function copyText(text: string, textarea: HTMLTextAreaElement): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission or focus issue — fall through to execCommand.
  }
  try {
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

function flash(btn: HTMLButtonElement, msg: string): void {
  const original = btn.dataset.original ?? btn.textContent ?? "Copy";
  btn.dataset.original = original;
  btn.textContent = msg;
  window.setTimeout(() => {
    btn.textContent = btn.dataset.original ?? "Copy";
  }, 1500);
}

const CSS = `
:host { all: initial; }
.p2m-overlay {
  position: fixed;
  display: none;
  z-index: ${Z};
  pointer-events: none;
  background: rgba(75, 140, 255, 0.28);
  border: 1px solid rgba(75, 140, 255, 0.9);
  box-sizing: border-box;
  border-radius: 2px;
}
.p2m-label {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 3px;
  padding: 2px 6px;
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #fff;
  background: #1f2937;
  border-radius: 3px;
  white-space: nowrap;
  max-width: 60vw;
  overflow: hidden;
  text-overflow: ellipsis;
}
.p2m-panel {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: ${Z};
  width: min(460px, calc(100vw - 32px));
  max-height: min(70vh, 640px);
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #111827;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow: hidden;
}
.p2m-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: #f3f4f6;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
}
.p2m-actions { display: flex; gap: 6px; }
.p2m-btn {
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: #ffffff;
  color: #111827;
  cursor: pointer;
}
.p2m-btn:hover { background: #f9fafb; }
.p2m-copy { background: #2563eb; border-color: #2563eb; color: #fff; }
.p2m-copy:hover { background: #1d4ed8; }
.p2m-output {
  flex: 1;
  min-height: 120px;
  margin: 0;
  padding: 10px;
  border: 0;
  resize: none;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #111827;
  background: #ffffff;
  white-space: pre;
  overflow: auto;
}
.p2m-output:focus { outline: none; }
.p2m-hint {
  padding: 5px 10px;
  font-size: 11px;
  color: #6b7280;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
}
@media (prefers-color-scheme: dark) {
  .p2m-panel { background: #1f2937; color: #f3f4f6; border-color: #374151; }
  .p2m-panel-header { background: #111827; border-color: #374151; }
  .p2m-btn { background: #374151; color: #f3f4f6; border-color: #4b5563; }
  .p2m-btn:hover { background: #4b5563; }
  .p2m-output { background: #1f2937; color: #f3f4f6; }
  .p2m-hint { background: #111827; color: #9ca3af; border-color: #374151; }
}
`;

export {};
