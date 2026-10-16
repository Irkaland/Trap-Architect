/**
 * Active play time: accumulates only while running AND the tab is visible.
 * Paused time (pause menu, dialogs, overlays) and hidden-tab time are excluded.
 * Personal information only; it is not independently verified.
 */
export class ActiveTimer {
  private acc = 0;
  private since: number | null = null;
  private wanted = false;
  private readonly onVis = () => this.sync();

  constructor() {
    document.addEventListener('visibilitychange', this.onVis);
  }

  private sync(): void {
    const shouldRun = this.wanted && document.visibilityState === 'visible';
    if (shouldRun && this.since === null) this.since = performance.now();
    if (!shouldRun && this.since !== null) {
      this.acc += performance.now() - this.since;
      this.since = null;
    }
  }

  set running(on: boolean) {
    this.wanted = on;
    this.sync();
  }

  get running(): boolean {
    return this.wanted;
  }

  elapsed(): number {
    return this.acc + (this.since !== null ? performance.now() - this.since : 0);
  }

  reset(): void {
    this.acc = 0;
    this.since = null;
    this.sync();
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onVis);
  }
}
