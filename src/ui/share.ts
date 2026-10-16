import { S } from '../strings';

export type HostKind = 'public' | 'local' | 'lan';

/** Can friends actually open links made on this host? */
export function hostKind(loc: Location = window.location): HostKind {
  if (loc.protocol === 'file:') return 'local';
  const h = loc.hostname.replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h) || h === '0.0.0.0') return 'local';
  if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith('.local')) return 'lan';
  return 'public';
}

export function hostNote(): string | null {
  const k = hostKind();
  if (k === 'local') return S.localhostNote;
  if (k === 'lan') return S.lanNote;
  return null;
}

/** Absolute link to this game with the given hash payload. */
export function linkFor(hashPayload: string): string {
  const { origin, pathname, search, protocol, href } = window.location;
  const base = protocol === 'file:' ? href.split('#')[0] : origin + pathname + search;
  return `${base}#${hashPayload}`;
}

/** Copy with the async Clipboard API, falling back to execCommand. */
export async function copyText(text: string, fallbackInput?: HTMLInputElement | HTMLTextAreaElement): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const el = fallbackInput ?? Object.assign(document.createElement('textarea'), { value: text });
    if (!fallbackInput) {
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.append(el);
    }
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    if (!fallbackInput) el.remove();
    return ok;
  } catch {
    return false;
  }
}

export const canNativeShare = (): boolean => typeof navigator.share === 'function';

/** Returns 'shared', 'cancelled' or 'failed'. */
export async function nativeShare(data: ShareData): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
