import { Session } from '../core/session';
import type { Dir, GameState, Level } from '../core/types';
import { S } from '../strings';
import type { App, Screen } from './app';
import { dialogOpen, openDialog } from './dialog';
import { announce, btn, formatTime, h, toast } from './dom';
import { I } from './icons';
import { openHelp } from './panels';
import { play } from './sound';
import { ActiveTimer } from './timer';

export interface WinContext {
  moves: number;
  path: Dir[];
  time: number;
  undos: number;
  screen: GameScreen;
}

export interface GameConfig {
  level: Level;
  title: string;
  subtitle: string;
  hint: string | null;
  /** Label + value for the comparison stat (Target or Benchmark). */
  goalLabel: string;
  goal: () => number | null;
  best: () => number | undefined;
  showGuide?: boolean;
  onBack(): void;
  backLabel: string;
  /** Mode-specific win handling; returns the card to show. */
  onWin(ctx: WinContext): HTMLElement;
}

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
  w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R',
};

export class GameScreen implements Screen {
  readonly el: HTMLElement;
  private readonly session: Session;
  private readonly timer = new ActiveTimer();
  private readonly overlay: HTMLElement;
  private readonly stats: Record<'moves' | 'best' | 'goal' | 'undos' | 'time', HTMLElement>;
  private readonly restartBtn: HTMLButtonElement;
  private readonly controls: HTMLElement;
  private readonly boardSlot: HTMLElement;
  private tick = 0;
  private restartArmed = 0;
  private replayTimer = 0;
  private replaying = false;
  private paused = false;

  constructor(private readonly app: App, private readonly cfg: GameConfig) {
    this.session = new Session(cfg.level);

    const stat = (label: string, main = false) => {
      const v = h('span', { class: 'value' }, '0');
      const box = h('div', { class: `stat${main ? ' main' : ''}` }, h('span', { class: 'label' }, label), v);
      return { v, box };
    };
    const sMoves = stat(S.moves, true);
    const sBest = stat(S.best);
    const sGoal = stat(cfg.goalLabel);
    const sUndos = stat(S.undos);
    const sTime = stat(S.time);
    this.stats = { moves: sMoves.v, best: sBest.v, goal: sGoal.v, undos: sUndos.v, time: sTime.v };

    this.boardSlot = h('div', { class: 'board-slot' });
    this.overlay = h('div', { class: 'overlay' });
    const boardWrap = h('div', { class: 'board-wrap' }, this.boardSlot, this.overlay);

    const dirBtn = (d: Dir, cls: string, label: string, ic: string) => {
      const b = btn(label, () => this.move(d), { icon: ic, iconOnly: true, cls });
      return b;
    };
    this.restartBtn = btn(S.restart, () => this.requestRestart(false), { icon: I.restart });
    this.controls = h(
      'div',
      { class: 'controls', role: 'group', 'aria-label': 'Game controls' },
      h('div', { class: 'side-actions' }, btn(S.undo, () => this.undo(), { icon: I.undo }), this.restartBtn),
      h(
        'div',
        { class: 'dpad' },
        dirBtn('U', 'up', S.up, I.up),
        dirBtn('L', 'left', S.left, I.left),
        dirBtn('D', 'down', S.down, I.down),
        dirBtn('R', 'right', S.right, I.right),
      ),
    );

    const hud = h('div', { class: 'hud', role: 'group', 'aria-label': 'Score' }, sMoves.box, sBest.box, sGoal.box, sUndos.box, sTime.box);
    const side = h(
      'div',
      { class: 'side' },
      hud,
      h('p', { class: 'hint' }, cfg.hint ?? ''),
      this.controls,
      h('p', { class: 'keys-hint' }, S.keysHint),
    );

    this.el = h(
      'section',
      { class: 'screen game', 'aria-label': cfg.title },
      h(
        'header',
        { class: 'topbar' },
        btn(cfg.backLabel, () => this.leave(), { icon: I.back, iconOnly: true }),
        h('div', { class: 'title' }, h('h1', { tabindex: '-1' }, cfg.title), h('div', { class: 'sub' }, cfg.subtitle)),
        btn(S.pause, () => this.openPause(), { icon: I.pause, iconOnly: true }),
      ),
      h('div', { class: 'game-body' }, boardWrap, side),
    );
  }

  mount(): void {
    const view = this.app.view;
    view.mount(this.boardSlot);
    view.host.removeAttribute('tabindex');
    view.host.removeAttribute('role');
    view.host.setAttribute('aria-label', 'Puzzle board');
    view.input = { onSwipe: (d) => this.move(d) };
    view.showPlay(this.cfg.level, this.session.state);
    this.updateHud();
    this.tick = window.setInterval(() => this.updateTime(), 250);
    if (this.cfg.showGuide) this.showGuide();
  }

  destroy(): void {
    window.clearInterval(this.tick);
    window.clearInterval(this.replayTimer);
    this.timer.running = false;
    this.timer.dispose();
    this.app.view.input = {};
  }

  /* ---------------- input ---------------- */

  onKey(e: KeyboardEvent): boolean {
    const dir = KEY_DIRS[e.key];
    if (dir) {
      this.move(dir);
      return true;
    }
    if (e.key === 'z' || e.key === 'Z') {
      this.undo();
      return true;
    }
    if (e.key === 'r' || e.key === 'R') {
      this.requestRestart(true);
      return true;
    }
    if (e.key === 'Escape') {
      this.openPause();
      return true;
    }
    return false;
  }

  private leave(): void {
    this.cfg.onBack();
  }

  /* ---------------- game actions ---------------- */

  private move(dir: Dir): void {
    if (this.replaying || this.paused) return;
    const st = this.session.state;
    if (st.status !== 'playing') {
      if (st.status === 'lost') this.flashFail();
      return;
    }
    this.dismissGuide();
    const prev = st;
    const r = this.session.move(dir);
    if (r.outcome === 'blocked') {
      this.app.view.bump(dir);
      play('blocked');
      return;
    }
    this.disarmRestart();
    this.afterStep(prev, r.state, r.pushed);
  }

  private afterStep(prev: GameState, next: GameState, pushed: number): void {
    this.app.view.showPlay(this.cfg.level, next, true, pushed);
    if (next.doors.some((o, i) => o !== prev.doors[i])) play('door');
    else play(pushed >= 0 ? 'push' : 'move');
    this.syncTimer();
    this.updateHud();
    if (this.replaying) return;
    if (next.status === 'lost') {
      play('zap');
      this.showFail();
    } else if (next.status === 'won') {
      play('win');
      this.showWin();
    }
  }

  private undo(): void {
    if (this.replaying || this.paused) return;
    const undone = this.session.undo();
    if (!undone) return;
    this.disarmRestart();
    this.clearOverlay();
    play('undo');
    this.app.view.showPlay(this.cfg.level, this.session.state, true, -2);
    this.syncTimer();
    this.updateHud();
    announce(`${S.undo}. ${S.movesN(this.session.state.moves)}`);
  }

  private requestRestart(fromKey: boolean): void {
    if (this.replaying || this.paused) return;
    const st = this.session.state;
    const progress = st.moves > 0 && st.status === 'playing';
    if (!progress || this.restartArmed) {
      this.restart();
      return;
    }
    this.restartArmed = window.setTimeout(() => this.disarmRestart(), 2500);
    if (fromKey) toast(S.pressRAgain, 2500);
    this.restartBtn.classList.add('confirming');
    this.restartBtn.querySelector('span')!.textContent = S.confirmRestart;
  }

  private disarmRestart(): void {
    if (!this.restartArmed) return;
    window.clearTimeout(this.restartArmed);
    this.restartArmed = 0;
    this.restartBtn.classList.remove('confirming');
    this.restartBtn.querySelector('span')!.textContent = S.restart;
    document.querySelector('.toast')?.remove();
  }

  restart(): void {
    this.disarmRestart();
    this.session.restart();
    this.timer.reset();
    this.syncTimer();
    this.clearOverlay();
    this.app.view.showPlay(this.cfg.level, this.session.state, false);
    this.updateHud();
    announce(S.restart);
  }

  private syncTimer(): void {
    const st = this.session.state;
    this.timer.running = !this.replaying && !this.paused && st.status === 'playing' && st.moves > 0;
  }

  /* ---------------- HUD ---------------- */

  private updateHud(): void {
    const st = this.session.state;
    this.stats.moves.textContent = String(st.moves);
    const best = this.cfg.best();
    this.stats.best.textContent = best !== undefined ? String(best) : S.none;
    const goal = this.cfg.goal();
    this.stats.goal.textContent = goal !== null ? String(goal) : S.none;
    this.stats.undos.textContent = String(this.session.undoCount);
    this.updateTime();
  }

  private updateTime(): void {
    this.stats.time.textContent = formatTime(this.timer.elapsed());
  }

  /* ---------------- overlays ---------------- */

  private clearOverlay(): void {
    this.overlay.replaceChildren();
    this.overlay.className = 'overlay';
  }

  private showGuide(): void {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const card = h(
      'div',
      { class: 'card guide', role: 'note' },
      h('h2', {}, S.guideTitle),
      h('p', { class: 'lead' }, S.guideGoal),
      h('p', {}, touch ? S.guideTouch : S.guideKeys),
      h('div', { class: 'actions' }, btn(S.gotIt, () => this.dismissGuide(), { cls: 'primary' })),
    );
    this.overlay.replaceChildren(card);
    this.app.updateSettings({ seenGuide: true });
  }

  private dismissGuide(): void {
    const g = this.overlay.querySelector('.guide');
    if (g) g.remove();
  }

  private showFail(): void {
    const card = h(
      'div',
      { class: 'card fail', role: 'alert' },
      h('h2', {}, S.failTitle),
      h('p', { class: 'lead' }, S.failBody),
      h('div', { class: 'actions' }, btn(`${S.undo} (Z)`, () => this.undo(), { cls: 'primary', icon: I.undo }), btn(`${S.restart} (R)`, () => this.restart(), { icon: I.restart })),
    );
    this.overlay.className = 'overlay bottom';
    this.overlay.replaceChildren(card);
    card.querySelector<HTMLButtonElement>('.btn.primary')?.focus({ preventScroll: true });
  }

  private flashFail(): void {
    const card = this.overlay.querySelector('.card.fail');
    if (card) {
      card.animate?.([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 160 });
    }
  }

  private showWin(): void {
    const st = this.session.state;
    const card = this.cfg.onWin({ moves: st.moves, path: st.path.slice(), time: this.timer.elapsed(), undos: this.session.undoCount, screen: this });
    this.updateHud();
    this.overlay.className = 'overlay';
    this.overlay.replaceChildren(card);
    window.setTimeout(() => card.querySelector<HTMLButtonElement>('.btn.primary')?.focus({ preventScroll: true }), 60);
  }

  /** Small helper for win cards: a 3-up stat row. */
  static resultRow(items: [string, string][]): HTMLElement {
    return h(
      'div',
      { class: 'result-grid' },
      ...items.map(([l, v]) => h('div', { class: 'stat' }, h('span', { class: 'label' }, l), h('span', { class: 'value' }, v))),
    );
  }

  /* ---------------- pause ---------------- */

  private openPause(): void {
    if (dialogOpen() || this.paused) return;
    this.paused = true;
    this.syncTimer();
    const d = openDialog(
      S.paused,
      [h('p', { class: 'lead' }, `${this.cfg.title} · ${S.movesN(this.session.state.moves)} · ${formatTime(this.timer.elapsed())}`)],
      [
        { label: S.help, value: 'help', icon: I.help },
        { label: S.settings, value: 'settings', icon: I.gear },
        { label: S.restart, value: 'restart', icon: I.restart },
        { label: this.cfg.backLabel, value: 'leave', icon: I.back },
        { label: S.resume, value: 'resume', cls: 'primary', icon: I.play },
      ],
      () => {
        this.paused = false;
        this.syncTimer();
      },
    );
    void d.result.then((v) => {
      if (v === 'restart') this.restart();
      else if (v === 'leave') this.leave();
      else if (v === 'help') openHelp();
      else if (v === 'settings') this.app.openSettings();
    });
  }

  /* ---------------- replay of a supplied solution ---------------- */

  startReplay(moves: Dir[]): void {
    this.clearOverlay();
    this.disarmRestart();
    this.session.restart();
    this.timer.reset();
    this.replaying = true;
    this.syncTimer();
    this.controls.setAttribute('aria-disabled', 'true');
    this.app.view.showPlay(this.cfg.level, this.session.state, false);
    this.updateHud();
    const banner = h('div', { class: 'banner', role: 'status' }, h('span', {}, S.replaying), btn(S.stopReplay, () => this.stopReplay(), { icon: I.stop }));
    this.overlay.className = 'overlay';
    this.overlay.style.alignItems = 'flex-start';
    this.overlay.replaceChildren(banner);
    let i = 0;
    const speed = this.app.reducedMotion ? 450 : 280;
    this.replayTimer = window.setInterval(() => {
      if (i >= moves.length) {
        window.clearInterval(this.replayTimer);
        window.setTimeout(() => this.stopReplay(), 900);
        return;
      }
      const prev = this.session.state;
      const r = this.session.move(moves[i++]);
      if (r.outcome === 'moved' || r.outcome === 'pushed') this.afterStep(prev, r.state, r.pushed);
    }, speed);
  }

  private stopReplay(): void {
    if (!this.replaying) return;
    window.clearInterval(this.replayTimer);
    this.replaying = false;
    this.controls.removeAttribute('aria-disabled');
    this.overlay.style.alignItems = '';
    this.restart();
    toast(S.yourTurn);
  }
}
