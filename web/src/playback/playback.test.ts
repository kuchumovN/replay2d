import type { MapInfo, RoundData, RoundMeta } from '@replay2d/shared';
import { describe, expect, it } from 'vitest';
import { levelIndex, worldToRadar } from '../map/transform';
import { framePos, lerpAngle, sampleGrenade, samplePlayer } from './interp';
import { blindAmount, bombState, formatClock, roundClock, scoreAt } from './state';

const nuke: MapInfo = {
  name: 'de_nuke',
  displayName: 'Nuke',
  posX: -3453,
  posY: 2887,
  scale: 7,
  levels: [
    { name: 'default', image: '', altitudeMin: -495, altitudeMax: 10000 },
    { name: 'lower', image: '', altitudeMin: -10000, altitudeMax: -495 },
  ],
};

function makeRound(overrides: Partial<RoundData> = {}): RoundData {
  return {
    number: 1,
    startTick: 100,
    endTick: 108,
    frameStep: 2,
    frameCount: 5,
    slowStep: 4,
    slowCount: 3,
    strings: ['AK-47', 'C4 Explosive', 'knife'],
    players: [
      {
        steamid: 'a',
        x: [0, 10, 1000, null, null],
        y: [0, 0, 0, null, null],
        z: [0, 0, 0, null, null],
        yaw: [170, -170, 0, null, null],
        hp: [100, 90, 90, 0, 0],
        alive: [1, 1, 1, 0, 0],
        weapon: [0, 0, 0, 0, 0],
        side: [2, 2, 2, 2, 2],
      },
    ],
    slow: [
      {
        steamid: 'a',
        armor: [0, 0, 0],
        helmet: [0, 0, 0],
        defuser: [0, 0, 0],
        money: [0, 0, 0],
        kills: [0, 0, 0],
        deaths: [0, 0, 0],
        assists: [0, 0, 0],
        inventory: [[2, 1], [2], [2]],
      },
    ],
    events: [],
    grenades: [],
    effects: [],
    ...overrides,
  };
}

describe('transform', () => {
  it('maps the overview origin to the radar corner', () => {
    expect(worldToRadar(nuke, -3453, 2887)).toEqual({ x: 0, y: 0 });
    expect(worldToRadar(nuke, -3453 + 7 * 1024, 2887 - 7 * 512)).toEqual({ x: 1024, y: 512 });
  });

  it('picks the level by altitude', () => {
    expect(levelIndex(nuke, 0)).toBe(0);
    expect(levelIndex(nuke, -600)).toBe(1);
    expect(levelIndex(nuke, null)).toBe(0);
    expect(levelIndex({ ...nuke, levels: nuke.levels.slice(0, 1) }, -600)).toBe(0);
  });
});

describe('interpolation', () => {
  it('interpolates angles across ±180', () => {
    expect(lerpAngle(170, -170, 0.5)).toBe(180);
    expect(lerpAngle(-10, 10, 0.25)).toBe(-5);
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0);
  });

  it('clamps frame position to the round', () => {
    const round = makeRound();
    expect(framePos(round, 50)).toMatchObject({ i0: 0, t: 0 });
    expect(framePos(round, 103)).toMatchObject({ i0: 1, i1: 2, t: 0.5 });
    expect(framePos(round, 500)).toMatchObject({ i0: 4, i1: 4 });
  });

  it('samples players with interpolation, teleports and gaps', () => {
    const round = makeRound();
    expect(samplePlayer(round, 0, 101)).toMatchObject({ x: 5, yaw: 180, hp: 90, alive: true, weapon: 'AK-47' });
    // 10 → 1000 is a teleport: snap to the nearest frame instead of sliding.
    expect(samplePlayer(round, 0, 102.5)!.x).toBe(10);
    expect(samplePlayer(round, 0, 103.5)!.x).toBe(1000);
    // Next frame missing: hold the last known position.
    expect(samplePlayer(round, 0, 105)!.x).toBe(1000);
    expect(samplePlayer(round, 0, 107)).toBeNull();
  });

  it('samples grenade tracks with a shorter last segment', () => {
    const track = { type: 'he' as const, thrower: null, startTick: 10, endTick: 15, points: [0, 0, 0, 20, 0, 0, 40, 0, 0, 50, 0, 0] };
    expect(sampleGrenade(track, 11, 2)!.x).toBe(10);
    expect(sampleGrenade(track, 14.5, 2)!.x).toBe(45);
    expect(sampleGrenade(track, 15, 2)!.x).toBe(50);
    expect(sampleGrenade(track, 16, 2)).toBeNull();
  });
});

describe('round state', () => {
  const meta: RoundMeta = {
    number: 1,
    startTick: 100,
    freezeEndTick: 1380,
    endTick: 9000,
    officialEndTick: 9448,
    winner: 3,
    endKind: 'bomb_defused',
    ctScore: 5,
    tScore: 3,
    ctName: 'CT',
    tName: 'T',
    roundTime: 115,
  };

  it('tracks the bomb through pickup, plant and defuse', () => {
    const round = makeRound({
      events: [
        { type: 'bomb', tick: 100, action: 'pickup', player: 'a', pos: null },
        { type: 'bomb', tick: 200, action: 'drop', player: 'a', pos: { x: 1, y: 2, z: 3 } },
        { type: 'bomb', tick: 300, action: 'pickup', player: 'b', pos: null },
        { type: 'bomb', tick: 400, action: 'beginplant', player: 'b', pos: { x: 5, y: 5, z: 0 } },
        { type: 'bomb', tick: 605, action: 'planted', player: 'b', pos: { x: 5, y: 5, z: 0 } },
        { type: 'bomb', tick: 1000, action: 'begindefuse', player: 'c', pos: null, hasKit: true },
        { type: 'bomb', tick: 1320, action: 'defused', player: 'c', pos: null },
      ],
    });
    expect(bombState(round, 150, 64)).toEqual({ kind: 'carried', player: 'a', planting: null });
    expect(bombState(round, 250, 64)).toEqual({ kind: 'dropped', pos: { x: 1, y: 2, z: 3 } });
    expect(bombState(round, 450, 64)).toMatchObject({ kind: 'carried', player: 'b', planting: { startTick: 400 } });
    expect(bombState(round, 700, 64)).toMatchObject({ kind: 'planted', plantTick: 605, defuse: null });
    expect(bombState(round, 1100, 64)).toMatchObject({ kind: 'planted', defuse: { player: 'c', endTick: 1000 + 5 * 64 } });
    expect(bombState(round, 1400, 64)).toEqual({ kind: 'defused', pos: { x: 5, y: 5, z: 0 } });
  });

  it('falls back to the inventory before any bomb event', () => {
    expect(bombState(makeRound(), 100, 64)).toEqual({ kind: 'carried', player: 'a', planting: null });
    expect(bombState(makeRound(), 106, 64)).toBeNull();
  });

  it('uses the inventory when a dropped bomb was picked up without an event', () => {
    const round = makeRound({
      // inventory: slow sample 0 (tick 100) has the C4, samples 1–2 do not.
      slow: [{ ...makeRound().slow[0], inventory: [[2], [2], [2, 1]] }],
      events: [{ type: 'bomb', tick: 101, action: 'drop', player: 'a', pos: { x: 1, y: 2, z: 3 } }],
    });
    expect(bombState(round, 105, 64)).toEqual({ kind: 'dropped', pos: { x: 1, y: 2, z: 3 } });
    expect(bombState(round, 108, 64)).toEqual({ kind: 'carried', player: 'a', planting: null });
  });

  it('computes flash intensity', () => {
    const round = makeRound({ events: [{ type: 'blind', tick: 100, player: 'a', duration: 2 }] });
    expect(blindAmount(round, 'a', 164, 64)).toBeCloseTo(0.5);
    expect(blindAmount(round, 'a', 300, 64)).toBe(0);
    expect(blindAmount(round, 'b', 120, 64)).toBe(0);
  });

  it('computes the round clock', () => {
    const round = makeRound({ events: [{ type: 'bomb', tick: 5000, action: 'planted', player: 'b', pos: null }] });
    expect(roundClock(meta, round, 100, 64, 40)).toEqual({ kind: 'freeze', seconds: 20 });
    expect(roundClock(meta, round, 1380 + 64 * 15, 64, 40)).toEqual({ kind: 'round', seconds: 100 });
    expect(roundClock(meta, round, 5000 + 64 * 10, 64, 40)).toEqual({ kind: 'bomb', seconds: 30 });
    expect(roundClock(meta, round, 9000, 64, 40).kind).toBe('over');
  });

  it('counts the round result only after round_end', () => {
    expect(scoreAt(meta, 5000)).toEqual({ ct: 4, t: 3 });
    expect(scoreAt(meta, 9000)).toEqual({ ct: 5, t: 3 });
    expect(scoreAt({ ...meta, winner: 2 }, 5000)).toEqual({ ct: 5, t: 2 });
  });

  it('formats clocks', () => {
    expect(formatClock(115)).toBe('1:55');
    expect(formatClock(9.2)).toBe('0:10');
    expect(formatClock(0)).toBe('0:00');
  });
});
