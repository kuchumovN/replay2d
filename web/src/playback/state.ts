import {
  INVENTORY_C4,
  SIDE_CT,
  type BlindEvent,
  type BombEvent,
  type KillEvent,
  type RoundData,
  type RoundMeta,
  type Vec3,
} from '@replay2d/shared';
import { slowIndex } from './interp';

const PLANT_SECONDS = 3.2;
const DEFUSE_SECONDS = 10;
const DEFUSE_KIT_SECONDS = 5;

export type BombState =
  | { kind: 'carried'; player: string; planting: { startTick: number; endTick: number } | null }
  | { kind: 'dropped'; pos: Vec3 }
  | { kind: 'planted'; pos: Vec3; plantTick: number; defuse: { player: string; startTick: number; endTick: number } | null }
  | { kind: 'defused'; pos: Vec3 }
  | { kind: 'exploded'; pos: Vec3; tick: number };

export function killsUntil(round: RoundData, tick: number): KillEvent[] {
  return round.events.filter((e): e is KillEvent => e.type === 'kill' && e.tick <= tick);
}

/** Who holds the bomb according to the inventory sample (used before any bomb event in the round). */
function carrierFromInventory(round: RoundData, tick: number): string | null {
  const c4 = round.strings.indexOf(INVENTORY_C4);
  if (c4 < 0) return null;
  const si = slowIndex(round, tick);
  return round.slow.find((p) => p.inventory[si]?.includes(c4))?.steamid ?? null;
}

export function bombState(round: RoundData, tick: number, tickrate: number): BombState | null {
  const events = round.events.filter((e): e is BombEvent => e.type === 'bomb' && e.tick <= tick);
  let state = null as BombState | null;
  let lastPos: Vec3 | null = null;
  for (const e of events) {
    if (e.pos) lastPos = e.pos;
    switch (e.action) {
      case 'pickup':
        if (e.player) state = { kind: 'carried', player: e.player, planting: null };
        break;
      case 'drop':
        if (e.pos) state = { kind: 'dropped', pos: e.pos };
        break;
      case 'beginplant':
        if (state?.kind === 'carried' && state.player === e.player) {
          state = { ...state, planting: { startTick: e.tick, endTick: e.tick + PLANT_SECONDS * tickrate } };
        } else if (e.player) {
          state = { kind: 'carried', player: e.player, planting: { startTick: e.tick, endTick: e.tick + PLANT_SECONDS * tickrate } };
        }
        break;
      case 'planted':
        state = { kind: 'planted', pos: e.pos ?? lastPos ?? { x: 0, y: 0, z: 0 }, plantTick: e.tick, defuse: null };
        break;
      case 'begindefuse':
        if (state?.kind === 'planted' && e.player) {
          const seconds = e.hasKit ? DEFUSE_KIT_SECONDS : DEFUSE_SECONDS;
          state = { ...state, defuse: { player: e.player, startTick: e.tick, endTick: e.tick + seconds * tickrate } };
        }
        break;
      case 'defused':
        state = { kind: 'defused', pos: state?.kind === 'planted' ? state.pos : (lastPos ?? { x: 0, y: 0, z: 0 }) };
        break;
      case 'exploded':
        state = { kind: 'exploded', pos: state?.kind === 'planted' ? state.pos : (lastPos ?? { x: 0, y: 0, z: 0 }), tick: e.tick };
        break;
    }
  }
  // Plant/defuse attempts have no "aborted" event; they are shown only for their nominal duration.
  if (state?.kind === 'carried' && state.planting && tick > state.planting.endTick) state = { ...state, planting: null };
  if (state?.kind === 'planted' && state.defuse && tick > state.defuse.endTick) state = { ...state, defuse: null };
  // Without an event, trust the inventory: before any bomb event, and when someone picked up a dropped
  // bomb without a pickup event (the sample must be taken after the drop).
  const dropTick = state?.kind === 'dropped' ? events.at(-1)!.tick : null;
  const sampleTick = round.startTick + slowIndex(round, tick) * round.slowStep;
  if (!state || (dropTick !== null && sampleTick > dropTick)) {
    const carrier = carrierFromInventory(round, tick);
    if (carrier) state = { kind: 'carried', player: carrier, planting: null };
  }
  return state;
}

/** 0..1 flash intensity for a player at a tick. */
export function blindAmount(round: RoundData, player: string, tick: number, tickrate: number): number {
  let amount = 0;
  for (const e of round.events) {
    if (e.type !== 'blind' || e.player !== player || e.tick > tick) continue;
    const end = e.tick + (e as BlindEvent).duration * tickrate;
    if (tick < end) amount = Math.max(amount, (end - tick) / (end - e.tick));
  }
  return amount;
}

export interface RoundClock {
  kind: 'freeze' | 'round' | 'bomb' | 'over';
  seconds: number;
}

export function roundClock(meta: RoundMeta, round: RoundData, tick: number, tickrate: number, c4Timer: number): RoundClock {
  if (tick >= meta.endTick) return { kind: 'over', seconds: 0 };
  const plant = round.events.find((e) => e.type === 'bomb' && e.action === 'planted' && e.tick <= tick);
  if (plant) return { kind: 'bomb', seconds: Math.max(0, c4Timer - (tick - plant.tick) / tickrate) };
  if (meta.freezeEndTick === null || tick < meta.freezeEndTick) {
    const end = meta.freezeEndTick ?? meta.endTick;
    return { kind: 'freeze', seconds: Math.max(0, (end - tick) / tickrate) };
  }
  return { kind: 'round', seconds: Math.max(0, meta.roundTime - (tick - meta.freezeEndTick) / tickrate) };
}

/** Score shown at a tick: the round's result is only counted once round_end has happened. */
export function scoreAt(meta: RoundMeta, tick: number): { ct: number; t: number } {
  if (tick >= meta.endTick) return { ct: meta.ctScore, t: meta.tScore };
  return {
    ct: meta.ctScore - (meta.winner === SIDE_CT ? 1 : 0),
    t: meta.tScore - (meta.winner === SIDE_CT ? 0 : meta.winner ? 1 : 0),
  };
}

export function formatClock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
