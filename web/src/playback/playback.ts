import type { MatchMeta, RoundData } from '@replay2d/shared';
import { getRound } from '../api';

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
/** Rounds open shortly before freeze time ends, skipping most of the buy phase. */
const LEAD_IN_SECONDS = 5;
/** React panels are refreshed at most this often while playing; the canvas redraws every frame. */
const UI_INTERVAL_MS = 100;

export interface PlaybackSnapshot {
  roundIndex: number;
  tick: number;
  playing: boolean;
  speed: number;
  selected: string | null;
  round: RoundData | null;
  error: string | null;
}

/**
 * Owns the playback clock. The canvas reads `tick` directly on every animation frame; React
 * subscribes through useSyncExternalStore and receives throttled snapshots.
 */
export class Playback {
  roundIndex = 0;
  tick = 0;
  playing = false;
  speed = 1;
  selected: string | null = null;
  round: RoundData | null = null;
  error: string | null = null;

  private listeners = new Set<() => void>();
  private snapshot: PlaybackSnapshot;
  private raf = 0;
  private lastFrame = 0;
  private lastNotify = 0;
  private loadToken = 0;

  constructor(
    readonly meta: MatchMeta,
    private readonly matchId: string,
  ) {
    this.snapshot = this.makeSnapshot();
    this.goToRound(0);
  }

  start() {
    const loop = (now: number) => {
      const dt = this.lastFrame ? Math.min(now - this.lastFrame, 250) : 0;
      this.lastFrame = now;
      if (this.playing && this.round) this.advance((dt / 1000) * this.meta.tickrate * this.speed);
      if (this.playing && now - this.lastNotify >= UI_INTERVAL_MS) this.notify();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  get roundMeta() {
    return this.meta.rounds[this.roundIndex];
  }

  togglePlay() {
    if (!this.playing && this.round && this.tick >= this.round.endTick && this.roundIndex === this.meta.rounds.length - 1) {
      this.tick = this.entryTick(this.roundIndex);
    }
    this.playing = !this.playing;
    this.notify();
  }

  setSpeed(speed: number) {
    this.speed = speed;
    this.notify();
  }

  changeSpeed(delta: 1 | -1) {
    const i = SPEEDS.indexOf(this.speed) + delta;
    if (i >= 0 && i < SPEEDS.length) this.setSpeed(SPEEDS[i]);
  }

  seek(tick: number) {
    const r = this.roundMeta;
    this.tick = Math.min(Math.max(tick, r.startTick), r.officialEndTick);
    this.notify();
  }

  seekSeconds(seconds: number) {
    this.seek(this.tick + seconds * this.meta.tickrate);
  }

  select(steamid: string | null) {
    this.selected = this.selected === steamid ? null : steamid;
    this.notify();
  }

  goToRound(index: number) {
    if (index < 0 || index >= this.meta.rounds.length) return;
    this.roundIndex = index;
    this.tick = this.entryTick(index);
    this.round = null;
    this.error = null;
    this.notify();

    const token = ++this.loadToken;
    getRound(this.matchId, index + 1)
      .then((round) => {
        if (token !== this.loadToken) return;
        this.round = round;
        this.notify();
        if (index + 1 < this.meta.rounds.length) getRound(this.matchId, index + 2).catch(() => {});
      })
      .catch((err: Error) => {
        if (token !== this.loadToken) return;
        this.error = err.message;
        this.playing = false;
        this.notify();
      });
  }

  private entryTick(index: number) {
    const r = this.meta.rounds[index];
    if (r.freezeEndTick === null) return r.startTick;
    return Math.max(r.startTick, r.freezeEndTick - LEAD_IN_SECONDS * this.meta.tickrate);
  }

  private advance(ticks: number) {
    const end = this.roundMeta.officialEndTick;
    this.tick += ticks;
    if (this.tick < end) return;
    if (this.roundIndex + 1 < this.meta.rounds.length) {
      this.goToRound(this.roundIndex + 1);
    } else {
      this.tick = end;
      this.playing = false;
      this.notify();
    }
  }

  private makeSnapshot(): PlaybackSnapshot {
    return {
      roundIndex: this.roundIndex,
      tick: this.tick,
      playing: this.playing,
      speed: this.speed,
      selected: this.selected,
      round: this.round,
      error: this.error,
    };
  }

  private notify() {
    this.lastNotify = performance.now();
    this.snapshot = this.makeSnapshot();
    for (const l of this.listeners) l();
  }
}
