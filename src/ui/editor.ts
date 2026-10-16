import { boardIssues, emptyBoard, type BoardIssue } from '../core/board';
import { applyTool, type Tool } from '../core/editing';
import { orphanDoorGroups } from '../core/sim';
import { DIRS, GRID, type Board, type Dir, type Group } from '../core/types';
import { S } from '../strings';
import type { App, Screen } from './app';
import { confirmDialog } from './dialog';
import { announce, btn, h, icon } from './dom';
import { I, OBJ, doorIcon, plateIcon, symbolIcon } from './icons';
import { openHelp, openShareDialog } from './panels';
import { play } from './sound';

const TOOLS: Tool[] = ['wall', 'crate', 'plate', 'door', 'laser', 'player', 'exit', 'erase'];
const DRAG_TOOLS = new Set<Tool>(['wall', 'erase']);

const TOOL_LABEL: Record<Tool, string> = {
  wall: S.toolWall, crate: S.toolCrate, plate: S.toolPlate, door: S.toolDoor,
  laser: S.toolLaser, player: S.toolPlayer, exit: S.toolExit, erase: S.toolErase,
};
const TOOL_TIP: Record<Tool, string> = {
  wall: S.tipWall, crate: S.tipCrate, plate: S.tipPlate, door: S.tipDoor,
  laser: S.tipLaser, player: S.tipPlayer, exit: S.tipExit, erase: S.tipErase,
};
const ISSUE_TEXT: Record<BoardIssue, string> = {
  'no-player': S.issueNoPlayer,
  'many-players': S.issueManyPlayers,
  'no-exit': S.issueNoExit,
  'many-exits': S.issueManyExits,
  'start-in-laser': S.issueStartLaser,
  'bad-occupant': S.issueBadOccupant,
  'bad-size': S.issueBadOccupant,
};

const DIR_ICON: Record<Dir, string> = { U: I.up, R: I.right, D: I.down, L: I.left };

function describeCell(board: Board, i: number): string {
  const c = board[i];
  const parts: string[] = [];
  const t = c.tile;
  if (t.kind === 'floor') parts.push('empty');
  else if (t.kind === 'plate') parts.push(`${S.groupNames[t.group]} plate`);
  else if (t.kind === 'door') parts.push(`${S.groupNames[t.group]} door`);
  else if (t.kind === 'emitter') parts.push(`laser facing ${S.dirNames[t.dir].toLowerCase()}`);
  else parts.push(t.kind);
  if (c.occ !== 'none') parts.push(`with ${c.occ}`);
  return parts.join(' ');
}

export class EditorScreen implements Screen {
  readonly el: HTMLElement;
  private tool: Tool = 'wall';
  private group: Group = 0;
  private dir: Dir = 'R';
  private cursor = 0;
  private showCursor = false;
  private readonly boardSlot: HTMLElement;
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly options: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly status: HTMLElement;
  private readonly testBtn: HTMLButtonElement;
  private readonly shareBtn: HTMLButtonElement;
  private readonly undoBtn: HTMLButtonElement;
  private strokeStarted = false;

  constructor(private readonly app: App) {
    this.boardSlot = h('div', { class: 'board-slot' });
    const palette = h('div', { class: 'palette', role: 'group', 'aria-label': S.tools });
    TOOLS.forEach((t, k) => {
      const b = h('button', { type: 'button', class: 'tool', 'aria-pressed': 'false', title: `${TOOL_LABEL[t]} (${k + 1})` });
      b.append(icon(this.toolIcon(t)), h('span', {}, TOOL_LABEL[t]));
      b.addEventListener('click', () => this.selectTool(t));
      this.toolButtons.set(t, b);
      palette.append(b);
    });
    this.options = h('div', { class: 'options' });
    this.tip = h('p', { class: 'tip' });
    this.status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    this.undoBtn = btn(S.undoEdit, () => this.undoEdit(), { icon: I.undo });
    this.testBtn = btn(S.test, () => this.app.testDraft(), { cls: 'primary', icon: I.play });
    this.shareBtn = btn(S.share, () => this.share(), { icon: I.share });
    const clearBtn = btn(S.clear, () => this.clear(), { icon: I.trash });

    this.el = h(
      'section',
      { class: 'screen game editor', 'aria-label': S.editorTitle },
      h(
        'header',
        { class: 'topbar' },
        btn(S.menu, () => this.app.goTitle(), { icon: I.back, iconOnly: true }),
        h('div', { class: 'title' }, h('h1', { tabindex: '-1' }, S.editorTitle), h('div', { class: 'sub' }, this.app.draft.name || S.untitledRoom)),
        btn(S.help, () => openHelp(), { icon: I.help, iconOnly: true }),
      ),
      h(
        'div',
        { class: 'game-body' },
        h('div', { class: 'board-wrap' }, this.boardSlot),
        h(
          'div',
          { class: 'side' },
          palette,
          this.options,
          this.tip,
          this.status,
          h('div', { class: 'editor-actions' }, this.testBtn, this.shareBtn, this.undoBtn, clearBtn),
        ),
      ),
    );
    this.selectTool('wall');
  }

  private toolIcon(t: Tool): string {
    switch (t) {
      case 'plate': return plateIcon(this.group);
      case 'door': return doorIcon(this.group);
      case 'laser': return OBJ.laser;
      default: return OBJ[t];
    }
  }

  private get board(): Board {
    return this.app.draft.board;
  }

  mount(): void {
    const view = this.app.view;
    view.mount(this.boardSlot);
    const host = view.host;
    host.setAttribute('tabindex', '0');
    host.setAttribute('role', 'application');
    host.setAttribute('aria-label', S.boardLabel);
    host.onfocus = () => {
      this.showCursor = true;
      this.render();
    };
    host.onblur = () => {
      this.showCursor = false;
      this.render();
    };
    view.input = {
      onTap: (cell) => {
        this.cursor = cell;
        this.strokeStarted = false;
        this.paint(cell, false);
      },
      onDrag: (cell) => {
        this.cursor = cell;
        if (DRAG_TOOLS.has(this.tool)) this.paint(cell, true);
      },
    };
    this.render();
    this.updateStatus();
  }

  destroy(): void {
    const host = this.app.view.host;
    host.onfocus = null;
    host.onblur = null;
    host.removeAttribute('tabindex');
    host.removeAttribute('role');
    this.app.view.input = {};
  }

  onKey(e: KeyboardEvent): boolean {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= TOOLS.length) {
      this.selectTool(TOOLS[n - 1]);
      return true;
    }
    if (e.key === 'z' || e.key === 'Z') {
      this.undoEdit();
      return true;
    }
    if (document.activeElement !== this.app.view.host) return false;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const m = moves[e.key];
    if (m) {
      const x = Math.min(GRID - 1, Math.max(0, (this.cursor % GRID) + m[0]));
      const y = Math.min(GRID - 1, Math.max(0, Math.floor(this.cursor / GRID) + m[1]));
      this.cursor = y * GRID + x;
      this.showCursor = true;
      this.render();
      announce(S.cursorAt(x, y, describeCell(this.board, this.cursor)));
      return true;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      this.strokeStarted = false;
      this.paint(this.cursor, false);
      announce(S.cursorAt(this.cursor % GRID, Math.floor(this.cursor / GRID), describeCell(this.board, this.cursor)));
      return true;
    }
    return false;
  }

  private selectTool(t: Tool): void {
    this.tool = t;
    this.toolButtons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === t)));
    this.tip.textContent = TOOL_TIP[t];
    this.renderOptions();
  }

  private renderOptions(): void {
    const o = this.options;
    o.replaceChildren();
    const radioGroup = (label: string, items: { label: string; svg: string; checked: boolean; pick: () => void }[]) => {
      const g = h('div', { role: 'radiogroup', 'aria-label': label, class: 'options' });
      const chips = items.map((it) => {
        const c = h('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(it.checked), 'aria-label': it.label, title: it.label });
        c.append(icon(it.svg));
        c.addEventListener('click', () => {
          it.pick();
          this.renderOptions();
          (o.querySelectorAll<HTMLButtonElement>('.chip')[items.indexOf(it)])?.focus();
        });
        return c;
      });
      g.append(h('span', { class: 'label' }, label), ...chips);
      return g;
    };
    if (this.tool === 'plate' || this.tool === 'door') {
      o.append(
        radioGroup(S.group, ([0, 1, 2] as Group[]).map((g) => ({
          label: S.groupNames[g],
          svg: symbolIcon(g),
          checked: this.group === g,
          pick: () => {
            this.group = g;
            this.toolButtons.get('plate')!.firstElementChild!.replaceWith(icon(plateIcon(g)));
            this.toolButtons.get('door')!.firstElementChild!.replaceWith(icon(doorIcon(g)));
          },
        }))),
      );
    } else if (this.tool === 'laser') {
      o.append(
        radioGroup(S.direction, DIRS.map((d) => ({ label: S.dirNames[d], svg: DIR_ICON[d], checked: this.dir === d, pick: () => (this.dir = d) }))),
      );
    }
  }

  private paint(cell: number, dragging: boolean): void {
    const r = applyTool(this.board, cell, this.tool, this.group, this.dir);
    if (!r) {
      this.render();
      return;
    }
    // One undo step per stroke (a drag counts once).
    if (!dragging || !this.strokeStarted) this.app.pushEditHistory();
    this.strokeStarted = true;
    if (r.rotated) {
      this.dir = r.rotated;
      this.renderOptions();
    }
    this.app.setDraftBoard(r.board);
    play('place');
    this.render();
    this.updateStatus();
  }

  private undoEdit(): void {
    if (this.app.popEditHistory()) {
      this.render();
      this.updateStatus();
    }
  }

  private async clear(): Promise<void> {
    if (!(await confirmDialog(S.clearTitle, S.clearBody, S.clear))) return;
    this.app.pushEditHistory();
    this.app.setDraftBoard(emptyBoard());
    this.render();
    this.updateStatus();
  }

  private share(): void {
    const d = this.app.draft;
    if (!d.solution) return;
    openShareDialog(d.board, d.solution, d.name, (n) => {
      this.app.setDraftName(n);
      const sub = this.el.querySelector('.topbar .sub');
      if (sub) sub.textContent = n || S.untitledRoom;
    });
  }

  private render(): void {
    this.app.view.showEdit(this.board, this.cursor, this.showCursor);
  }

  private updateStatus(): void {
    const issues = boardIssues(this.board);
    const d = this.app.draft;
    this.testBtn.disabled = issues.length > 0;
    this.shareBtn.disabled = !d.solution;
    this.undoBtn.disabled = !this.app.canUndoEdit();
    const s = this.status;
    s.replaceChildren();
    if (issues.length) {
      s.className = 'status bad';
      s.append(issues.map((i) => ISSUE_TEXT[i]).join(' '));
    } else if (d.solution) {
      s.className = 'status ok';
      s.append(S.verifiedIn(d.solution.length));
    } else {
      s.className = 'status';
      s.append(S.notVerified);
    }
    if (orphanDoorGroups(this.board.map((c) => c.tile)).length) s.append(h('span', { class: 'warn' }, S.orphanDoor));
  }
}
