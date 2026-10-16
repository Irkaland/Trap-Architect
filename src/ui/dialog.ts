import { S } from '../strings';
import { btn, h } from './dom';
import { I } from './icons';

export interface DialogAction {
  label: string;
  value: string;
  cls?: string;
  icon?: string;
  /** Return false to keep the dialog open. */
  onClick?: () => void | boolean;
}

export interface DialogHandle {
  el: HTMLDialogElement;
  close(value?: string): void;
  result: Promise<string | null>;
}

let openCount = 0;
export const dialogOpen = (): boolean => openCount > 0;

/** Native modal <dialog>: focus trapping, Escape-to-close and inert background for free. */
export function openDialog(title: string, body: Node[], actions: DialogAction[] = [], onClose?: () => void): DialogHandle {
  const prevFocus = document.activeElement as HTMLElement | null;
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const dlg = h('dialog', { 'aria-labelledby': titleId });
  let resolve!: (v: string | null) => void;
  const result = new Promise<string | null>((r) => (resolve = r));
  let settled: string | null = null;

  const close = (value?: string) => {
    settled = value ?? null;
    if (dlg.open) dlg.close();
  };

  const head = h('div', { class: 'dlg-head' }, h('h2', { id: titleId }, title), btn(S.close, () => close(), { icon: I.close, iconOnly: true, cls: 'ghost' }));
  const content = h('div', { class: 'dlg-body' }, ...body);
  const acts = h('div', { class: 'dlg-actions' });
  for (const a of actions) {
    acts.append(
      btn(a.label, () => {
        if (a.onClick && a.onClick() === false) return;
        close(a.value);
      }, { cls: a.cls, icon: a.icon }),
    );
  }
  dlg.append(h('div', { class: 'dlg' }, head, content, actions.length ? acts : null));
  dlg.addEventListener('close', () => {
    openCount = Math.max(0, openCount - 1);
    dlg.remove();
    onClose?.();
    resolve(settled);
    prevFocus?.focus?.();
  });
  // Clicking the backdrop closes.
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });
  document.body.append(dlg);
  openCount++;
  dlg.showModal();
  // Start on the main action rather than the close button.
  (dlg.querySelector<HTMLElement>('.dlg-body input:not([readonly])') ?? dlg.querySelector<HTMLElement>('.dlg-actions .btn.primary'))?.focus();
  return { el: dlg, close, result };
}

export async function confirmDialog(title: string, message: string, confirmLabel: string, danger = true): Promise<boolean> {
  const d = openDialog(title, [h('p', {}, message)], [
    { label: S.cancel, value: 'no' },
    { label: confirmLabel, value: 'yes', cls: danger ? 'danger' : 'primary' },
  ]);
  return (await d.result) === 'yes';
}
