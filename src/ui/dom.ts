/*
 * Tiny element builder. Text is always set with textContent; the only HTML
 * strings ever parsed are the constant SVG icons defined in icons.ts.
 */
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Parse one of our constant SVG icon strings. Never call with user data. */
export function icon(svg: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = svg.trim();
  const el = t.content.firstElementChild as SVGElement;
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  return el;
}

export function btn(
  label: string,
  onClick: (e: MouseEvent) => void,
  opts: { cls?: string; icon?: string; iconOnly?: boolean; title?: string } = {},
): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `btn ${opts.cls ?? ''}`.trim() });
  if (opts.icon) b.append(icon(opts.icon));
  if (opts.iconOnly) {
    b.classList.add('icon');
    b.setAttribute('aria-label', label);
    b.title = opts.title ?? label;
  } else {
    b.append(h('span', {}, label));
  }
  b.addEventListener('click', onClick);
  return b;
}

let toastTimer = 0;
export function toast(message: string, ms = 2200): void {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(t);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), ms);
}

/** Screen-reader announcement via the polite live region. */
export function announce(message: string): void {
  const a = document.getElementById('announcer');
  if (!a) return;
  a.textContent = '';
  window.setTimeout(() => (a.textContent = message), 30);
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function isTextInput(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type);
  }
  return false;
}
