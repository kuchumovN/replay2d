import type { GrenadeTrack, RoundData, Side } from '@replay2d/shared';

/** Movement above this between two frames is a respawn/teleport and is not interpolated. */
const TELEPORT_DISTANCE = 300;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolates angles in degrees along the shortest arc, result in (-180, 180]. */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  let r = a + d * t;
  r = ((r % 360) + 540) % 360 - 180;
  return r === -180 ? 180 : r;
}

export interface FramePos {
  /** Float frame index, clamped to the round. */
  f: number;
  i0: number;
  i1: number;
  t: number;
}

export function framePos(round: RoundData, tick: number): FramePos {
  const f = Math.min(Math.max((tick - round.startTick) / round.frameStep, 0), round.frameCount - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, round.frameCount - 1);
  return { f, i0, i1, t: f - i0 };
}

export function slowIndex(round: RoundData, tick: number): number {
  return Math.min(Math.max(Math.floor((tick - round.startTick) / round.slowStep), 0), round.slowCount - 1);
}

export interface PlayerSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  alive: boolean;
  weapon: string;
  side: Side;
}

/** Player state at a (fractional) tick, or null when the player has no position data there. */
export function samplePlayer(round: RoundData, playerIndex: number, tick: number): PlayerSample | null {
  const p = round.players[playerIndex];
  const { i0, i1, t } = framePos(round, tick);
  const near = t < 0.5 ? i0 : i1;
  const x0 = p.x[i0];
  const x1 = p.x[i1];
  if (x0 == null && x1 == null) return null;

  let x: number, y: number, z: number, yaw: number;
  if (x0 == null || x1 == null) {
    const i = x0 == null ? i1 : i0;
    x = p.x[i]!;
    y = p.y[i]!;
    z = p.z[i]!;
    yaw = p.yaw[i] ?? 0;
  } else {
    const jump = Math.hypot(x1 - x0, p.y[i1]! - p.y[i0]!) > TELEPORT_DISTANCE;
    const k = jump ? (t < 0.5 ? 0 : 1) : t;
    x = lerp(x0, x1, k);
    y = lerp(p.y[i0]!, p.y[i1]!, k);
    z = lerp(p.z[i0]!, p.z[i1]!, k);
    yaw = lerpAngle(p.yaw[i0] ?? 0, p.yaw[i1] ?? 0, k);
  }
  return {
    x,
    y,
    z,
    yaw,
    hp: p.hp[near],
    alive: p.alive[near] === 1,
    weapon: round.strings[p.weapon[near]] ?? '',
    side: p.side[near],
  };
}

/** Grenade position at a tick; points are every frameStep ticks from startTick, the last one at endTick. */
export function sampleGrenade(track: GrenadeTrack, tick: number, step: number): { x: number; y: number; z: number; index: number } | null {
  if (tick < track.startTick || tick > track.endTick) return null;
  const n = track.points.length / 3;
  const f = (tick - track.startTick) / step;
  const i0 = Math.min(Math.floor(f), n - 1);
  const i1 = Math.min(i0 + 1, n - 1);
  const t0 = track.startTick + i0 * step;
  const t1 = i1 === n - 1 ? track.endTick : track.startTick + i1 * step;
  const t = t1 > t0 ? Math.min((tick - t0) / (t1 - t0), 1) : 0;
  const p = track.points;
  return {
    x: lerp(p[i0 * 3], p[i1 * 3], t),
    y: lerp(p[i0 * 3 + 1], p[i1 * 3 + 1], t),
    z: lerp(p[i0 * 3 + 2], p[i1 * 3 + 2], t),
    index: i0,
  };
}
