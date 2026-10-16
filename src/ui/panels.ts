import { encodeChallenge, cleanName, MAX_NAME_CHARS } from '../core/codec';
import type { Board, Dir } from '../core/types';
import { S } from '../strings';
import { storageAvailable, type MotionPref, type Settings } from '../storage';
import { confirmDialog, openDialog } from './dialog';
import { btn, h, icon, toast } from './dom';
import { I, OBJ, doorIcon, plateIcon } from './icons';
import { canNativeShare, copyText, hostNote, linkFor, nativeShare } from './share';

/* ---------------- Help ---------------- */

export function openHelp(): void {
  const item = (svg: string, name: string, text: string) => h('li', {}, icon(svg), h('span', {}, h('b', {}, name), ' — ', text));
  const body = h(
    'div',
    { class: 'help' },
    h('p', {}, 'Reach the exit. Every step is one move. Fewer moves is better.'),
    h('h3', {}, 'The pieces'),
    h(
      'ul',
      {},
      item(OBJ.player, 'You', 'move one cell at a time.'),
      item(OBJ.crate, 'Crate', 'push it by walking into it. Only one at a time.'),
      item(OBJ.wall, 'Wall', 'blocks you, crates and lasers.'),
      item(plateIcon(0), 'Plate', 'pressed while you or a crate stand on it.'),
      item(doorIcon(0), 'Door', 'open while any plate with the same symbol is pressed. It won’t close on anything standing in it.'),
      item(OBJ.laser, 'Laser', 'fires one way. The beam stops at walls, closed doors, crates and other lasers.'),
      item(OBJ.beam, 'Beam', 'step into it and you’re zapped. Undo is always free.'),
      item(OBJ.exit, 'Exit', 'reach it alive to solve the room.'),
    ),
    h('h3', {}, 'Controls'),
    h(
      'ul',
      { class: 'plain' },
      h('li', {}, h('kbd', {}, 'Arrows'), ' or ', h('kbd', {}, 'WASD'), ' move · ', h('kbd', {}, 'Z'), ' undo · ', h('kbd', {}, 'R'), ' restart (press twice) · ', h('kbd', {}, 'Esc'), ' pause'),
      h('li', {}, 'On touch screens: swipe the board or use the big arrow buttons.'),
      h('li', {}, 'Blocked moves never count.'),
    ),
    h('h3', {}, 'Scores and challenges'),
    h(
      'ul',
      { class: 'plain' },
      h('li', {}, 'Moves are your score. Time is shown for your own interest only.'),
      h('li', {}, 'Each room’s target is the fewest moves we found with an exhaustive search.'),
      h('li', {}, 'Build a room, solve it, then share the link. Your friend’s browser replays your solution to check your benchmark.'),
      h('li', {}, 'That check proves the room can be solved in that many moves. It is not a tamper-proof leaderboard.'),
    ),
  );
  openDialog(S.help, [body], [{ label: S.close, value: 'ok', cls: 'primary' }]);
}

/* ---------------- Settings ---------------- */

function segmented<T extends string>(label: string, options: [T, string][], current: T, onPick: (v: T) => void): HTMLElement {
  const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map(([v, text]) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === current) }, text);
    b.addEventListener('click', () => {
      buttons.forEach((o) => o.setAttribute('aria-checked', String(o === b)));
      onPick(v);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      e.stopPropagation();
      const i = buttons.indexOf(b);
      const n = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
      n.focus();
      n.click();
    });
    return b;
  });
  group.append(...buttons);
  return h('div', { class: 'setting-row' }, h('span', {}, label), group);
}

export function openSettings(settings: Settings, apply: (s: Partial<Settings>) => void, onReset: () => void): void {
  const body: Node[] = [
    segmented(S.sound, [['on', S.on], ['off', S.off]], settings.sound ? 'on' : 'off', (v) => apply({ sound: v === 'on' })),
    segmented<MotionPref>(S.motion, [['system', S.motionSystem], ['reduced', S.motionReduced], ['full', S.motionFull]], settings.motion, (v) =>
      apply({ motion: v }),
    ),
  ];
  if (!storageAvailable()) body.push(h('p', { class: 'notice' }, S.storageOff));
  const reset = btn(S.resetProgress, async () => {
    if (await confirmDialog(S.resetTitle, S.resetBody, S.resetProgress)) {
      onReset();
      d.close();
      toast(S.resetDone);
    }
  }, { cls: 'danger', icon: I.trash });
  body.push(h('div', {}, reset));
  const d = openDialog(S.settingsTitle, body, [{ label: S.close, value: 'ok', cls: 'primary' }]);
}

/* ---------------- Share a challenge ---------------- */

export function challengeLink(board: Board, solution: Dir[], name: string): string {
  return linkFor(encodeChallenge({ board, moves: solution, name }));
}

export function openShareDialog(board: Board, solution: Dir[], name: string, onName: (n: string) => void): void {
  let current = cleanName(name);
  const input = h('input', { type: 'text', maxlength: MAX_NAME_CHARS, placeholder: S.roomNamePlaceholder, value: current, autocomplete: 'off', enterkeyhint: 'done' });
  const linkField = h('input', { type: 'text', readonly: true, 'aria-label': S.linkLabel });
  const status = h('p', { class: 'footnote', role: 'status', 'aria-live': 'polite' });
  const refresh = () => {
    linkField.value = challengeLink(board, solution, current);
  };
  input.addEventListener('input', () => {
    current = cleanName(input.value);
    onName(current);
    refresh();
  });
  refresh();
  const invite = () => S.shareInvite(solution.length, current);

  const copyBtn = btn(S.copyLink, async () => {
    const ok = await copyText(linkField.value, linkField);
    status.textContent = ok ? S.copied : S.copyFailed;
    if (!ok) linkField.select();
  }, { cls: 'primary', icon: I.copy });
  const actions = h('div', { class: 'editor-actions' }, copyBtn);
  if (canNativeShare()) {
    actions.append(
      btn(S.shareNative, async () => {
        const r = await nativeShare({ title: S.appName, text: invite(), url: linkField.value });
        if (r === 'failed') {
          const ok = await copyText(`${invite()}\n${linkField.value}`, linkField);
          status.textContent = ok ? S.copied : S.copyFailed;
        }
      }, { icon: I.share }),
    );
  }
  const note = hostNote();
  const body: Node[] = [
    h('label', { class: 'field' }, S.roomName, input),
    h('label', { class: 'field' }, S.linkLabel, linkField),
    actions,
    status,
    note ? h('p', { class: 'notice coral' }, note) : null,
    h('p', { class: 'footnote' }, S.shareHonesty),
  ].filter(Boolean) as Node[];
  openDialog(S.shareTitle, body, [{ label: S.close, value: 'ok' }]);
}
